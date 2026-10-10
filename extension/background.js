// HALO Virales — service worker.
// v1.6: las cuentas de REFERENCIA se reparten con el panel: si tu socio y tu analizais a la vez, cada cuenta la coge uno solo y
// el otro pasa a la siguiente (nadie espera en cola ni se repite). Ademas, cada lunes (8:00, hora de Madrid) la extension lanza
// sola una ronda de todas las cuentas con los ultimos 7 dias; si ese dia no habia Chrome abierto, la hace en cuanto se abra.
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

// Instagram no deja pedir los reels de un perfil con una llamada directa. Se abre la pagina de reels
// del perfil en una pestana y ig-hook.js (inyectado en la pagina) guarda lo que ella misma descarga.
// Despues, solo para los candidatos, se pide el detalle (fecha, texto, audio, video) con
// /api/v1/media/<id>/info/, que si funciona.

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirURL(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await new Promise((resolver) => {
    const escucha = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(escucha);
        resolver();
      }
    };
    chrome.tabs.onUpdated.addListener(escucha);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(escucha);
      resolver();
    }, 25000);
  });
  await esperar(2500);
}

// Dentro de la pagina (world MAIN): hace scroll para que Instagram cargue mas reels y devuelve lo captado.
async function recogerReelsEnPagina(maximo) {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const antes = () => window.__halo?.items.size ?? 0;
  const estadoPagina = () => {
    if (/\/accounts\/login/.test(location.pathname)) return "login";
    const texto = document.body?.innerText ?? "";
    if (/no está disponible|isn['’]t available|Sorry, this page/i.test(texto)) return "no_existe";
    if (/cuenta es privada|account is private/i.test(texto)) return "privada";
    return "ok";
  };
  if (!window.__halo) return { ok: false, motivo: "hook", detalle: "La extensión no pudo engancharse a Instagram. Recarga la extensión y la pestaña de Instagram." };

  // Esperar a que la pagina cargue la primera tanda de reels (hasta 10 s).
  for (let i = 0; i < 20 && !antes(); i++) await espera(500);
  // y a que lance la consulta que luego se repite para paginar (hasta 8 s mas).
  for (let i = 0; i < 8 && antes() && !window.__halo.consulta; i++) await espera(500);
  await espera(500);
  let paginacion = { ok: true, paginas: 0 };
  if (antes() && antes() < maximo) {
    // En una pestana en segundo plano Instagram no carga mas reels al hacer scroll: se repite su
    // propia consulta pidiendo las paginas siguientes.
    try {
      paginacion = await window.__halo.paginar(maximo);
    } catch (e) {
      paginacion = { ok: false, motivo: `error: ${String(e?.message ?? e).slice(0, 80)}`, paginas: 0 };
    }
  }
  const estado = estadoPagina();
  if (estado !== "ok" && !antes()) return { ok: false, motivo: estado === "login" ? "login" : "cuenta", detalle: estado === "login" ? "Instagram pide iniciar sesión" : estado === "privada" ? "Cuenta privada" : "La cuenta no existe o no está disponible" };

  const todos = [...window.__halo.items.values()];
  const propios = todos.filter((r) => r.propio);
  const lista = (propios.length ? propios : todos).filter((r) => r.esVideo).slice(0, maximo);
  return { ok: true, reels: lista, paginas: paginacion.paginas, avisoPaginacion: paginacion.ok ? null : paginacion.motivo };
}

// Dentro de la pagina: detalle de cada reel candidato (con pausa entre peticiones).
async function detallarReelsEnPagina(codigos) {
  const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
  const cab = { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf, "x-requested-with": "XMLHttpRequest" };
  const num = (v) => Math.max(0, Number(v ?? 0) || 0);
  const pk = (codigo) => {
    let id = 0n;
    for (const c of codigo.slice(0, 11)) id = id * 64n + BigInt(ALFABETO.indexOf(c));
    return id.toString();
  };
  const audioDe = (it) => {
    const a = it.clips_metadata?.music_info?.music_asset_info ?? it.music_metadata?.music_info?.music_asset_info ?? null;
    if (a) return { id: a.audio_cluster_id ?? a.id ?? null, titulo: a.title ?? a.song_name ?? null, artista: a.display_artist ?? a.artist_name ?? null };
    const o = it.clips_metadata?.original_sound_info;
    return o ? { id: o.audio_asset_id ?? null, titulo: o.original_audio_title ?? null, artista: o.ig_artist?.username ?? null } : null;
  };

  const detalles = [];
  for (const codigo of codigos) {
    if (window.__halo?.cancelar) break; // el usuario pulso Cancelar
    const res = await fetch(`/api/v1/media/${pk(codigo)}/info/`, { credentials: "include", headers: cab });
    if (res.status === 429) return { ok: false, motivo: "limite", detalles };
    if (res.status === 401 || res.status === 403) return { ok: false, motivo: "login", detalles };
    let it = null;
    try {
      it = (await res.json())?.items?.[0] ?? null;
    } catch {
      it = null;
    }
    if (it) {
      detalles.push({
        codigo,
        usuario: it.user?.username ?? null,
        vistas: num(it.play_count ?? it.ig_play_count ?? it.view_count),
        likes: num(it.like_count),
        comentarios: num(it.comment_count),
        compartidos: num(it.media_repost_count ?? it.reshare_count ?? it.share_count),
        videoUrl: it.video_versions?.[0]?.url ?? null,
        miniatura: it.image_versions2?.candidates?.[0]?.url ?? null,
        descripcion: it.caption?.text ?? null,
        audio: audioDe(it),
        fecha: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null,
        esVideo: it.media_type === 2 || Boolean(it.video_versions?.length),
      });
    }
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 700));
  }
  return { ok: true, detalles };
}

async function pestanaInstagram() {
  const existentes = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
  if (existentes.length) return { tab: existentes[0], creada: false };
  const tab = await chrome.tabs.create({ url: "https://www.instagram.com/", active: false });
  await abrirURL(tab.id, "https://www.instagram.com/");
  return { tab, creada: true };
}

async function ejecutarEnPagina(tabId, func, args) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return result;
}

async function leerCuenta(tabId, username, maximo) {
  await abrirURL(tabId, `https://www.instagram.com/${encodeURIComponent(username)}/reels/`);
  return (await ejecutarEnPagina(tabId, recogerReelsEnPagina, [maximo])) ?? { ok: false, motivo: "cuenta", detalle: "Sin respuesta de la pestaña de Instagram" };
}

async function detallarReels(tabId, codigos) {
  return (await ejecutarEnPagina(tabId, detallarReelsEnPagina, [codigos])) ?? { ok: false, motivo: "cuenta", detalles: [] };
}

/* ------------------------------------ run ----------------------------------- */

const pausa = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
// Pausa que se corta en cuanto se pulsa Cancelar
async function pausaCancelable(min, max) {
  const fin = Date.now() + min + Math.random() * (max - min);
  while (Date.now() < fin && !cancelar) await new Promise((r) => setTimeout(r, 250));
}

async function descargar(url) {
  // La CDN de Instagram limita (429) si se piden muchos videos seguidos: reintentar con esperas crecientes.
  let res;
  for (const espera of [0, 4000, 12000, 25000]) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    res = await fetch(url);
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
  }
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

// Pinta en la lista lo que han hecho / llevan los demas en la ronda compartida.
async function sincronizarRonda(ronda) {
  const e = await estado();
  const lista = (e.cuentas ?? []).map((c) => {
    const h = ronda.hechas?.[c.id];
    const t = ronda.tomadas?.[c.id];
    if (h && !["hecho", "error"].includes(c.estado)) return { ...c, estado: h.ok ? "hecho" : "error", nuevos: h.nuevos, detalle: `con ${h.por}` };
    if (t && c.estado === "pendiente") return { ...c, estado: `con ${t.por}…` };
    return c;
  });
  await guardarEstado({ cuentas: lista });
}

async function ejecutar({ modo, categoria, dias, ids, origen }) {
  if (corriendo) throw new Error("Ya hay un análisis en marcha");
  corriendo = true;
  cancelar = false;
  const aj = await ajustes();
  // Referencias: reels recientes (14 dias, 36 ultimos). Modelos: sus mejores de los ultimos 6 meses (hasta 120 reels).
  const diasUsados = Number(dias) > 0 ? Number(dias) : modo === "propias" ? 180 : aj.dias;
  const maximoReels = modo === "propias" ? 120 : 36;
  const maxPorCuenta = modo === "propias" ? 15 : 8;
  const resumen = { nuevos: 0, analizados: 0, errores: 0, cuentas: 0 };
  let tabInfo = null;
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

  await guardarEstado({ corriendo: true, modo, categoria: categoria ?? null, origen: origen ?? "manual", inicio: Date.now(), fin: null, log: [], cuentas: [], resumen: null });
  // Cuenta tomada de la ronda que aun no se ha terminado ni devuelto (si algo falla, se devuelve para que la haga otro)
  let actual = null;
  let ronda = null;
  try {
    // Cuentas de referencia sin elegir ninguna a mano = ronda COMPARTIDA con el panel (se reparten entre quienes analizan a la vez).
    const compartido = modo === "referencias" && !(Array.isArray(ids) && ids.length);
    let cuentas;
    if (compartido) {
      const r = await panel("/api/extension/ronda", { method: "POST", body: JSON.stringify({ accion: "unirse", categoria: categoria ?? "todas", dias: diasUsados, origen: origen ?? "manual" }) });
      ronda = r.ronda;
      cuentas = ronda.cuentas;
      await guardarEstado({ cuentas: cuentas.map((c) => ({ id: c.id, username: c.username, etiqueta: c.etiqueta, estado: "pendiente" })) });
      await sincronizarRonda(ronda);
      const otros = Object.values(ronda.tomadas ?? {}).filter((t) => t.por !== "").length;
      await log(r.unida ? `Te unes a la ronda de ${ronda.creada_por}${otros ? " que está en marcha" : ""}: las ${cuentas.length} cuentas se reparten entre los que analizáis (no se repite ninguna).` : `Ronda nueva: ${cuentas.length} cuenta(s). Si alguien más analiza a la vez, os las repartís.`);
    } else {
      const q = new URLSearchParams({ modo });
      if (categoria && categoria !== "todas") q.set("categoria", categoria);
      if (Array.isArray(ids) && ids.length) q.set("ids", ids.join(","));
      const config = await panel(`/api/extension/cuentas?${q}`);
      cuentas = config.cuentas ?? [];
      await guardarEstado({ cuentas: cuentas.map((c) => ({ username: c.username, etiqueta: c.etiqueta, estado: "pendiente" })) });
    }
    if (!cuentas.length) {
      await log(modo === "propias" ? "No hay cuentas de modelos activas en el panel." : "No hay cuentas de referencia activas con ese tipo.", "aviso");
      return;
    }
    await log(`${cuentas.length} cuenta(s) · hasta ${maximoReels} reels por cuenta · de los últimos ${diasUsados} días`);

    // Siguiente cuenta que me toca: en la ronda compartida la reparte el panel; si no, la lista tal cual.
    let siguiente = 0;
    const siguienteCuenta = async () => {
      if (!compartido) return siguiente < cuentas.length ? { cuenta: cuentas[siguiente], i: siguiente++ } : null;
      const r = await panel("/api/extension/ronda", { method: "POST", body: JSON.stringify({ accion: "siguiente", ronda_id: ronda.id }) });
      if (r.ronda) await sincronizarRonda(r.ronda);
      if (!r.cuenta) {
        if (r.otros) await log(`Tu parte está hecha: las ${r.otros} cuenta(s) que quedan las están analizando los demás.`, "ok");
        return null;
      }
      return { cuenta: r.cuenta, i: cuentas.findIndex((c) => c.id === r.cuenta.id) };
    };
    const avisarRonda = (accion, extra = {}) => (compartido && ronda && actual ? panel("/api/extension/ronda", { method: "POST", body: JSON.stringify({ accion, ronda_id: ronda.id, cuenta_id: actual, ...extra }) }).catch(() => null) : Promise.resolve(null));

    tabInfo = await pestanaInstagram();
    for (let primera = true; ; primera = false) {
      if (cancelar) {
        await log("Cancelado.", "aviso");
        break;
      }
      if (!primera) await pausaCancelable(...PAUSA_ENTRE_CUENTAS_MS);
      if (cancelar) {
        await log("Cancelado.", "aviso");
        break;
      }
      const sig = await siguienteCuenta();
      if (!sig) break;
      const { cuenta, i } = sig;
      if (compartido) actual = cuenta.id;
      let resuelta = false;
      const marcar = async (cambios) => {
        const e = await estado();
        const lista = [...e.cuentas];
        lista[i] = { ...lista[i], ...cambios };
        await guardarEstado({ cuentas: lista });
        // Ronda compartida: avisar al panel de como acaba cada cuenta (hecha, o devuelta si no se pudo por culpa de Instagram / cancelar)
        if (compartido && !resuelta) {
          if (cambios.estado === "hecho" || (cambios.estado === "error" && !cambios.fatal)) {
            resuelta = true;
            await avisarRonda("hecha", { nuevos: cambios.nuevos ?? 0, ok: cambios.estado === "hecho" });
            actual = null;
          } else if (cambios.estado === "cancelado" || (cambios.estado === "error" && cambios.fatal)) {
            resuelta = true;
            await avisarRonda("devolver");
            actual = null;
          }
        }
      };
      await marcar({ estado: "leyendo" });
      try {
        const lectura = await leerCuenta(tabInfo.tab.id, cuenta.username, maximoReels);
        if (cancelar) {
          await marcar({ estado: "cancelado" });
          await log("Cancelado.", "aviso");
          break;
        }
        const fallo = async (detalle, motivo) => {
          const fatal = motivo === "login" || motivo === "limite";
          await log(`@${cuenta.username}: ${detalle}`, "error");
          await marcar({ estado: "error", detalle, fatal });
          resumen.errores++;
          if (fatal) await log(motivo === "login" ? "Abre instagram.com en este Chrome, inicia sesión y vuelve a ejecutar." : "Instagram pide ir más despacio: espera unos minutos antes de repetir.", "aviso");
          return fatal;
        };
        if (!lectura.ok) {
          if (await fallo(lectura.detalle, lectura.motivo)) break;
          continue;
        }
        if (!lectura.reels.length) {
          await log(`@${cuenta.username}: Instagram no devolvió reels (¿cuenta sin reels?)`, "aviso");
          await marcar({ estado: "hecho", nuevos: 0, analizados: 0 });
          continue;
        }

        if (lectura.avisoPaginacion) await log(`@${cuenta.username}: solo se pudieron leer ${lectura.reels.length} reels (${lectura.avisoPaginacion === "limite" ? "Instagram limitó las peticiones" : "no se encontró la consulta de paginación"})`, "aviso");
        const sinMedios = (r) => {
          const { videoUrl, miniatura, ...resto } = r;
          void videoUrl;
          void miniatura;
          return resto;
        };
        // 1) Con solo las metricas de la cuadricula, el panel dice que reels superan el umbral.
        const previo = await panel("/api/extension/analizar", {
          method: "POST",
          body: JSON.stringify({ modo, cuenta_id: cuenta.id, reels: lectura.reels.map(sinMedios), dias: diasUsados, max: maxPorCuenta, fase: "candidatos" }),
        });
        if (cancelar) {
          await marcar({ estado: "cancelado" });
          await log("Cancelado.", "aviso");
          break;
        }
        // 2) Solo de esos se pide el detalle (fecha, texto, audio, video).
        const reelsPorCodigo = new Map(lectura.reels.map((r) => [r.codigo, r]));
        if (previo.subir.length) {
          await marcar({ estado: `detalle ${previo.subir.length}` });
          const det = await detallarReels(tabInfo.tab.id, previo.subir.map((c) => c.codigo));
          for (const d of det.detalles ?? []) {
            // Si el reel es de otra cuenta (sugerido), se descarta.
            if (d.usuario && d.usuario.toLowerCase() !== cuenta.username.toLowerCase()) reelsPorCodigo.delete(d.codigo);
            else reelsPorCodigo.set(d.codigo, { ...reelsPorCodigo.get(d.codigo), ...d });
          }
          if (!det.ok && (await fallo(det.motivo === "limite" ? "Instagram limita las peticiones (429)" : "Instagram pide iniciar sesión", det.motivo))) break;
        }
        if (cancelar) {
          await marcar({ estado: "cancelado" });
          await log("Cancelado.", "aviso");
          break;
        }
        // 3) El panel decide los definitivos (fecha, estilo...) y se suben.
        const analisis = await panel("/api/extension/analizar", {
          method: "POST",
          body: JSON.stringify({ modo, cuenta_id: cuenta.id, reels: [...reelsPorCodigo.values()].map(sinMedios), dias: diasUsados, max: maxPorCuenta }),
        });
        resumen.analizados += analisis.analizados;
        let subidos = 0;
        for (const candidato of analisis.subir) {
          if (cancelar) break;
          const reel = reelsPorCodigo.get(candidato.codigo);
          if (!reel?.videoUrl) continue;
          await marcar({ estado: `subiendo ${subidos + 1}/${analisis.subir.length}` });
          try {
            await subirReel(modo, cuenta, reel, analisis.mediana);
            subidos++;
            await pausa(700, 1500);
          } catch (e) {
            if (e instanceof ErrorPanel) throw e;
            await log(`@${cuenta.username}/${reel.codigo}: ${e.message}`, "error");
            resumen.errores++;
          }
        }
        resumen.nuevos += subidos;
        resumen.cuentas++;
        await log(`@${cuenta.username}: ${analisis.analizados} reels leídos (el más visto: ${Math.max(0, ...lectura.reels.map((r) => r.vistas)).toLocaleString("es-ES")}), mediana ${analisis.mediana.toLocaleString("es-ES")}, ${subidos} viral(es) nuevo(s)`, subidos ? "ok" : "info");
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
    }
  } catch (e) {
    await log(e.message, "error");
    resumen.errores++;
  } finally {
    clearInterval(keepAlive);
    if (actual && ronda) await panel("/api/extension/ronda", { method: "POST", body: JSON.stringify({ accion: "devolver", ronda_id: ronda.id, cuenta_id: actual }) }).catch(() => null);
    if (tabInfo?.creada) chrome.tabs.remove(tabInfo.tab.id).catch(() => {});
    corriendo = false;
    await log(`Terminado: ${resumen.nuevos} viral(es) nuevo(s) en ${resumen.cuentas} cuenta(s)${resumen.errores ? `, ${resumen.errores} error(es)` : ""}.`, resumen.errores ? "aviso" : "ok");
    await guardarEstado({ corriendo: false, fin: Date.now(), resumen });
  }
}

/* ------------------------ actualizar metricas existentes ------------------------ */

// Vuelve a pedir el detalle de los videos ya guardados (sin descargar nada) y actualiza visitas,
// likes, comentarios y compartidos (reposts) en el panel.
async function refrescarMetricas({ modo }) {
  if (corriendo) throw new Error("Ya hay un análisis en marcha");
  corriendo = true;
  cancelar = false;
  const resumen = { nuevos: 0, analizados: 0, errores: 0, cuentas: 0 };
  let tabInfo = null;
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  await guardarEstado({ corriendo: true, modo: "metricas", categoria: null, inicio: Date.now(), fin: null, log: [], cuentas: [], resumen: null });
  try {
    const { videos } = await panel(`/api/extension/metricas?modo=${modo}`);
    if (!videos.length) {
      await log("No hay vídeos pendientes de actualizar.", "ok");
      return;
    }
    await log(`${videos.length} vídeo(s) por actualizar (sin volver a descargarlos).`);
    tabInfo = await pestanaInstagram();
    if (!tabInfo.creada) await abrirURL(tabInfo.tab.id, "https://www.instagram.com/");
    const LOTE = 20;
    for (let i = 0; i < videos.length; i += LOTE) {
      if (cancelar) {
        await log("Cancelado.", "aviso");
        break;
      }
      const lote = videos.slice(i, i + LOTE);
      const det = await detallarReels(tabInfo.tab.id, lote.map((v) => v.codigo));
      const porCodigo = new Map((det.detalles ?? []).map((d) => [d.codigo, d]));
      const actualizaciones = lote
        .filter((v) => porCodigo.has(v.codigo))
        .map((v) => {
          const d = porCodigo.get(v.codigo);
          return { id: v.id, vistas: d.vistas, likes: d.likes, comentarios: d.comentarios, compartidos: d.compartidos };
        });
      if (actualizaciones.length) {
        const r = await panel("/api/extension/metricas", { method: "POST", body: JSON.stringify({ modo, actualizaciones }) });
        resumen.nuevos += r.hechos ?? 0;
      }
      resumen.analizados += lote.length;
      await log(`${Math.min(i + LOTE, videos.length)}/${videos.length} vídeos revisados`);
      if (!det.ok) {
        resumen.errores++;
        await log(det.motivo === "limite" ? "Instagram pide ir más despacio: espera unos minutos y repite (lo ya actualizado se conserva)." : "Instagram pide iniciar sesión.", "aviso");
        break;
      }
    }
  } catch (e) {
    await log(e.message, "error");
    resumen.errores++;
  } finally {
    clearInterval(keepAlive);
    if (tabInfo?.creada) chrome.tabs.remove(tabInfo.tab.id).catch(() => {});
    corriendo = false;
    await log(`Terminado: ${resumen.nuevos} vídeo(s) actualizado(s)${resumen.errores ? `, ${resumen.errores} aviso(s)` : ""}.`, resumen.errores ? "aviso" : "ok");
    await guardarEstado({ corriendo: false, fin: Date.now(), resumen });
  }
}

/* --------------------------------- cancelar --------------------------------- */

// Para el analisis en curso YA: avisa a la pestana de Instagram (que es donde se pasa la mayor parte del
// tiempo) y a los bucles de la extension. Si no hay nada en marcha pero el estado se quedo colgado como
// "analizando" (p. ej. el navegador durmio la extension a medias), lo deja limpio.
async function detener() {
  if (!corriendo) {
    await guardarEstado({ corriendo: false, fin: Date.now() });
    await log("No había ningún análisis en marcha: estado reiniciado.", "aviso");
    return;
  }
  cancelar = true;
  await log("Cancelando… se detiene en unos segundos.", "aviso");
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
    for (const tab of tabs) {
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, world: "MAIN", func: () => { if (window.__halo) window.__halo.cancelar = true; } })
        .catch(() => {});
    }
  } catch {
    /* sin pestanas de Instagram */
  }
}

/* --------------------------------- mensajes --------------------------------- */

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.type === "scan") {
    ejecutar(msg).catch((e) => log(e.message, "error"));
    responder({ ok: true });
  } else if (msg?.type === "refresh") {
    refrescarMetricas(msg).catch((e) => log(e.message, "error"));
    responder({ ok: true });
  } else if (msg?.type === "cancel") {
    detener().then(() => responder({ ok: true }));
    return true;
  } else if (msg?.type === "status") {
    estado().then((e) => responder({ ok: true, estado: e, version: chrome.runtime.getManifest().version }));
    return true;
  }
  return false;
});

// Si el navegador cerro el service worker a medias, no dejar el estado "corriendo" colgado.
chrome.runtime.onStartup.addListener(() => guardarEstado({ corriendo: false }));
chrome.runtime.onInstalled.addListener(() => guardarEstado({ corriendo: false }));


/* ---------------------------- ronda semanal (lunes) ---------------------------- */

// Cada 30 min se pregunta al panel si toca la ronda de esta semana (lunes 8:00 de Madrid en adelante, hasta que se complete).
// Si toca y esta extension esta libre, analiza todas las cuentas de referencia con los ultimos 7 dias, repartiendo el trabajo con
// quien mas lo haga a la vez. Necesita Chrome abierto con Instagram y el panel con la sesion iniciada.
const ALARMA_RONDA = "ronda-semanal";
const ESPERA_TRAS_FALLO_MS = 2 * 3600000;

function programarAlarma() {
  chrome.alarms.create(ALARMA_RONDA, { delayInMinutes: 2, periodInMinutes: 30 });
}

async function comprobarRondaSemanal() {
  if (corriendo) return;
  const { ultimoFallo } = await chrome.storage.local.get("ultimoFallo");
  if (ultimoFallo && Date.now() - ultimoFallo < ESPERA_TRAS_FALLO_MS) return;
  let s;
  try {
    s = await panel("/api/extension/ronda");
  } catch {
    return; // sin panel o sin sesion: no se molesta
  }
  if (!s?.debeCorrer) return;
  await ejecutar({ modo: "referencias", categoria: "todas", dias: 7, origen: "lunes" });
  // Si no llego a terminar por Instagram (login, limite...), no se insiste en 2 horas
  const e = await estado();
  if ((e.resumen?.errores ?? 0) > 0 && (e.resumen?.cuentas ?? 0) === 0) await chrome.storage.local.set({ ultimoFallo: Date.now() });
}

chrome.alarms.onAlarm.addListener((alarma) => {
  if (alarma.name === ALARMA_RONDA) comprobarRondaSemanal().catch(() => {});
});
chrome.runtime.onStartup.addListener(programarAlarma);
chrome.runtime.onInstalled.addListener(programarAlarma);
