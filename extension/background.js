// HALO Virales — service worker.
// Para cada cuenta: lee sus ultimos reels DESDE UNA PESTANA DE INSTAGRAM (con tu sesion, tu IP y el
// origen correcto), manda las metricas al panel (que decide cuales son virales), y sube a R2 solo el
// video y la miniatura de los que el panel pide. Nada de contrasenas: usa tu sesion de Instagram y
// tu sesion del panel en este mismo Chrome.

const POR_DEFECTO = { panelUrl: "https://halo-panel.vercel.app", dias: 14 };
const PAUSA_ENTRE_CUENTAS_MS = [2500, 5000];
const MAX_LOG = 300;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

let cancelar = false;
let corriendo = false;

/* ------------------------------ ajustes y estado ----------------------------- */

async function ajustes() {
  const { ajustes: a } = await chrome.storage.local.get("ajustes");
  return { ...POR_DEFECTO, ...(a ?? {}) };
}

async function estado() {
  const { estado: e } = await chrome.storage.local.get("estado");
  return e ?? { corriendo: false, log: [], cuentas: [], resumen: null };
}

async function guardarEstado(cambios) {
  const actual = await estado();
  const nuevo = { ...actual, ...cambios };
  await chrome.storage.local.set({ estado: nuevo });
  avisarPaneles({ type: "estado", estado: nuevo });
  return nuevo;
}

async function log(texto, nivel = "info") {
  const actual = await estado();
  const linea = { t: Date.now(), nivel, texto };
  await guardarEstado({ log: [...(actual.log ?? []), linea].slice(-MAX_LOG) });
}

async function avisarPaneles(mensaje) {
  try {
    const tabs = await chrome.tabs.query({ url: ["https://halo-panel.vercel.app/*", "http://localhost:3000/*"] });
    for (const tab of tabs) chrome.tabs.sendMessage(tab.id, mensaje).catch(() => {});
  } catch {
    /* sin paneles abiertos */
  }
}

/* ---------------------------------- panel ---------------------------------- */

class ErrorPanel extends Error {}

async function panel(ruta, opciones = {}) {
  const { panelUrl } = await ajustes();
  let res;
  try {
    res = await fetch(`${panelUrl}${ruta}`, {
      credentials: "include",
      ...opciones,
      headers: { "Content-Type": "application/json", ...(opciones.headers ?? {}) },
    });
  } catch (e) {
    throw new ErrorPanel(`No se pudo conectar con el panel (${panelUrl}): ${e.message}`);
  }
  if (res.status === 401) throw new ErrorPanel("El panel no te reconoce: abre el panel en este Chrome e inicia sesión, y vuelve a probar.");
  const texto = await res.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* respuesta no JSON */
  }
  if (!res.ok) throw new ErrorPanel(json?.error ?? `El panel respondió ${res.status}`);
  return json;
}

async function subirAlBucket(clave, blob, contentType) {
  const firma = await panel("/api/r2/presign", { method: "POST", body: JSON.stringify({ key: clave, contentType }) });
  const res = await fetch(firma.url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!res.ok) throw new Error(`R2 rechazó la subida (${res.status})`);
}

/* -------------------------------- instagram -------------------------------- */

// Se ejecuta DENTRO de la pestana de Instagram (world MAIN): tiene que ser autocontenida.
async function leerReelsEnInstagram(username, desdeMs, maximo) {
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
  const cab = { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", "x-asbd-id": "129477" };
  const num = (v) => Math.max(0, Number(v ?? 0) || 0);

  async function get(url) {
    const res = await fetch(url, { credentials: "include", headers: cab });
    const texto = await res.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* no JSON */
    }
    return { status: res.status, json, redirigido: res.redirected && /accounts\/login/.test(res.url) };
  }

  function audioDe(it) {
    const a = it.clips_metadata?.music_info?.music_asset_info ?? it.music_metadata?.music_info?.music_asset_info ?? it.audio_metadata ?? null;
    if (!a) return null;
    return { id: a.audio_cluster_id ?? a.id ?? a.music_canonical_id ?? null, titulo: a.title ?? a.song_name ?? a.name ?? null, artista: a.display_artist ?? a.artist_name ?? a.author_username ?? null };
  }

  function deItem(it) {
    return {
      codigo: it.code ?? null,
      vistas: num(it.play_count ?? it.view_count ?? it.ig_play_count),
      likes: num(it.like_count),
      comentarios: num(it.comment_count),
      compartidos: num(it.reshare_count ?? it.share_count),
      videoUrl: it.video_versions?.[0]?.url ?? null,
      miniatura: it.image_versions2?.candidates?.[0]?.url ?? null,
      descripcion: it.caption?.text ?? null,
      audio: audioDe(it),
      fecha: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null,
      esVideo: it.media_type === 2 || Boolean(it.video_versions?.length),
    };
  }

  const usuario = encodeURIComponent(username);
  const reels = [];
  let maxId = null;
  let ultimoEstado = 0;
  for (let pagina = 0; pagina < 4; pagina++) {
    const r = await get(`/api/v1/feed/user/${usuario}/username/?count=30${maxId ? `&max_id=${maxId}` : ""}`);
    ultimoEstado = r.status;
    if (r.redirigido || r.status === 401 || r.json?.message === "login_required") return { ok: false, motivo: "login", detalle: "Instagram pide iniciar sesión" };
    if (r.status === 429) return { ok: false, motivo: "limite", detalle: "Instagram limita las peticiones (429)" };
    if (r.status === 404 || r.json?.status === "fail") return { ok: false, motivo: "cuenta", detalle: r.json?.message ?? `Instagram ${r.status}` };
    if (!r.json?.items) break;
    reels.push(...r.json.items.map(deItem).filter((x) => x.codigo));
    const masAntiguo = Math.min(...r.json.items.map((i) => (i.taken_at ?? 0) * 1000).filter(Boolean), Infinity);
    if (!r.json.more_available || !r.json.next_max_id || reels.length >= maximo || masAntiguo < desdeMs) break;
    maxId = r.json.next_max_id;
  }
  if (reels.length) return { ok: true, reels };

  // Plan B: perfil web (devuelve menos reels, pero sirve si el feed falla)
  const p = await get(`/api/v1/users/web_profile_info/?username=${usuario}`);
  if (p.status === 429) return { ok: false, motivo: "limite", detalle: "Instagram limita las peticiones (429)" };
  const aristas = p.json?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];
  if (!aristas.length) return { ok: false, motivo: "cuenta", detalle: `Sin reels visibles (Instagram ${ultimoEstado || p.status}). ¿Cuenta privada o nombre mal escrito?` };
  return {
    ok: true,
    reels: aristas.map(({ node: n }) => ({
      codigo: n.shortcode ?? null,
      vistas: num(n.video_view_count ?? n.video_play_count),
      likes: num(n.edge_liked_by?.count ?? n.edge_media_preview_like?.count),
      comentarios: num(n.edge_media_to_comment?.count ?? n.edge_media_preview_comment?.count),
      compartidos: 0,
      videoUrl: n.video_url ?? null,
      miniatura: n.display_url ?? n.thumbnail_src ?? null,
      descripcion: n.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
      audio: audioDe(n),
      fecha: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
      esVideo: Boolean(n.is_video),
    })).filter((x) => x.codigo),
  };
}

async function pestanaInstagram() {
  const existentes = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
  if (existentes.length) return { tab: existentes[0], creada: false };
  const tab = await chrome.tabs.create({ url: "https://www.instagram.com/", active: false });
  await new Promise((resolver) => {
    const escucha = (id, info) => {
      if (id === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(escucha);
        resolver();
      }
    };
    chrome.tabs.onUpdated.addListener(escucha);
    setTimeout(resolver, 20000);
  });
  return { tab, creada: true };
}

async function leerCuenta(tabId, username, dias) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: leerReelsEnInstagram,
    args: [username, Date.now() - dias * 86400000, 60],
  });
  return result ?? { ok: false, motivo: "cuenta", detalle: "Sin respuesta de la pestaña de Instagram" };
}

/* ------------------------------------ run ----------------------------------- */

const pausa = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

async function descargar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga ${res.status}`);
  const blob = await res.blob();
  if (blob.size > MAX_VIDEO_BYTES) throw new Error("vídeo demasiado grande");
  return blob;
}

async function subirReel(modo, cuenta, reel, mediana) {
  const carpeta = modo === "propias" ? "propios" : "referencias";
  const base = `${carpeta}/${cuenta.username}/${reel.codigo}`;
  if (!reel.videoUrl) throw new Error("el reel no trae URL de vídeo");
  await subirAlBucket(`${base}.mp4`, await descargar(reel.videoUrl), "video/mp4");
  let thumbKey = null;
  if (reel.miniatura) {
    try {
      await subirAlBucket(`${base}.jpg`, await descargar(reel.miniatura), "image/jpeg");
      thumbKey = `${base}.jpg`;
    } catch {
      thumbKey = null;
    }
  }
  const { videoUrl, miniatura, ...datos } = reel;
  void videoUrl;
  void miniatura;
  await panel("/api/extension/videos", {
    method: "POST",
    body: JSON.stringify({ modo, cuenta_id: cuenta.id, reel: datos, video_key: `${base}.mp4`, thumbnail_key: thumbKey, mediana }),
  });
}

async function ejecutar({ modo, categoria, dias }) {
  if (corriendo) throw new Error("Ya hay un análisis en marcha");
  corriendo = true;
  cancelar = false;
  const aj = await ajustes();
  const diasUsados = Number(dias) > 0 ? Number(dias) : aj.dias;
  const resumen = { nuevos: 0, analizados: 0, errores: 0, cuentas: 0 };
  let tabInfo = null;
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

  await guardarEstado({ corriendo: true, modo, categoria: categoria ?? null, inicio: Date.now(), fin: null, log: [], cuentas: [], resumen: null });
  try {
    const q = new URLSearchParams({ modo });
    if (categoria && categoria !== "todas") q.set("categoria", categoria);
    const config = await panel(`/api/extension/cuentas?${q}`);
    const cuentas = config.cuentas ?? [];
    await guardarEstado({ cuentas: cuentas.map((c) => ({ username: c.username, etiqueta: c.etiqueta, estado: "pendiente" })) });
    if (!cuentas.length) {
      await log(modo === "propias" ? "No hay cuentas de modelos activas en el panel." : "No hay cuentas de referencia activas con ese tipo.", "aviso");
      return;
    }
    await log(`${cuentas.length} cuenta(s) · reels de los últimos ${diasUsados} días`);

    tabInfo = await pestanaInstagram();
    for (let i = 0; i < cuentas.length; i++) {
      if (cancelar) {
        await log("Cancelado.", "aviso");
        break;
      }
      const cuenta = cuentas[i];
      const marcar = async (cambios) => {
        const e = await estado();
        const lista = [...e.cuentas];
        lista[i] = { ...lista[i], ...cambios };
        await guardarEstado({ cuentas: lista });
      };
      await marcar({ estado: "leyendo" });
      try {
        const lectura = await leerCuenta(tabInfo.tab.id, cuenta.username, diasUsados);
        if (!lectura.ok) {
          const fatal = lectura.motivo === "login" || lectura.motivo === "limite";
          await log(`@${cuenta.username}: ${lectura.detalle}`, "error");
          await marcar({ estado: "error", detalle: lectura.detalle });
          resumen.errores++;
          if (fatal) {
            await log(lectura.motivo === "login" ? "Abre instagram.com en este Chrome, inicia sesión y vuelve a ejecutar." : "Instagram pide ir más despacio: espera unos minutos antes de repetir.", "aviso");
            break;
          }
          continue;
        }
        const reelsPorCodigo = new Map(lectura.reels.map((r) => [r.codigo, r]));
        const datos = lectura.reels.map(({ videoUrl, miniatura, ...resto }) => {
          void videoUrl;
          void miniatura;
          return resto;
        });
        const analisis = await panel("/api/extension/analizar", {
          method: "POST",
          body: JSON.stringify({ modo, cuenta_id: cuenta.id, reels: datos, dias: diasUsados }),
        });
        resumen.analizados += analisis.analizados;
        let subidos = 0;
        for (const candidato of analisis.subir) {
          if (cancelar) break;
          const reel = reelsPorCodigo.get(candidato.codigo);
          if (!reel) continue;
          await marcar({ estado: `subiendo ${subidos + 1}/${analisis.subir.length}` });
          try {
            await subirReel(modo, cuenta, reel, analisis.mediana);
            subidos++;
          } catch (e) {
            if (e instanceof ErrorPanel) throw e;
            await log(`@${cuenta.username}/${reel.codigo}: ${e.message}`, "error");
            resumen.errores++;
          }
        }
        resumen.nuevos += subidos;
        resumen.cuentas++;
        await log(`@${cuenta.username}: ${analisis.analizados} reels, mediana ${analisis.mediana}, ${subidos} viral(es) nuevo(s)`, subidos ? "ok" : "info");
        await marcar({ estado: "hecho", nuevos: subidos, analizados: analisis.analizados });
      } catch (e) {
        if (e instanceof ErrorPanel) {
          await log(e.message, "error");
          resumen.errores++;
          break;
        }
        await log(`@${cuenta.username}: ${e.message}`, "error");
        await marcar({ estado: "error", detalle: e.message });
        resumen.errores++;
      }
      if (i < cuentas.length - 1) await pausa(...PAUSA_ENTRE_CUENTAS_MS);
    }
  } catch (e) {
    await log(e.message, "error");
    resumen.errores++;
  } finally {
    clearInterval(keepAlive);
    if (tabInfo?.creada) chrome.tabs.remove(tabInfo.tab.id).catch(() => {});
    corriendo = false;
    await log(`Terminado: ${resumen.nuevos} viral(es) nuevo(s) en ${resumen.cuentas} cuenta(s)${resumen.errores ? `, ${resumen.errores} error(es)` : ""}.`, resumen.errores ? "aviso" : "ok");
    await guardarEstado({ corriendo: false, fin: Date.now(), resumen });
  }
}

/* --------------------------------- mensajes --------------------------------- */

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.type === "scan") {
    ejecutar(msg).catch((e) => log(e.message, "error"));
    responder({ ok: true });
  } else if (msg?.type === "cancel") {
    cancelar = true;
    responder({ ok: true });
  } else if (msg?.type === "status") {
    estado().then((e) => responder({ ok: true, estado: e, version: chrome.runtime.getManifest().version }));
    return true;
  }
  return false;
});

// Si el navegador cerro el service worker a medias, no dejar el estado "corriendo" colgado.
chrome.runtime.onStartup.addListener(() => guardarEstado({ corriendo: false }));
chrome.runtime.onInstalled.addListener(() => guardarEstado({ corriendo: false }));
