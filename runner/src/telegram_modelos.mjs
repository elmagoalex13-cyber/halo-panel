/**
 * Avisos de Telegram PARA LAS MODELOS (mensajes privados del bot a cada una):
 *  - VINCULACION: la modelo pulsa «Activar avisos» en su portal -> abre el bot con /start <codigo firmado> -> aqui se verifica el codigo y se
 *    guarda su chat en modelos.telegram_id. (El codigo lleva una firma con CRON_SECRET: nadie puede vincularse a una modelo ajena.)
 *  - FEEDBACK: cuando el equipo comenta sus reels (se agrupa: una vez que se acaba la racha) o revisa un script/pack/post.
 *  - RECORDATORIO cada 3 dias de lo que le falta por hacer (reels, scripts, packs, posts y videos por grabar), entre las 10:00 y las 20:00 de Madrid.
 * Solo escribe a modelos que se han vinculado ellas mismas.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { config } from "./config.mjs";
import { borrarDeR2, downloadFromR2, existeEnR2 } from "./r2.mjs";
import { hashOriginal } from "./previews.mjs";

const ZONA = "Europe/Madrid";
const RACHA_QUIETA_MS = 60000; // se junta lo que comentes seguido y se avisa 1 minuto despues del ultimo comentario
const RACHA_MAXIMA_MS = 5 * 60000;
const CADA_RECORDATORIO_MS = 72 * 3600000;
let ultimoRecordatorios = 0;
let ultimaInfoBot = 0;

const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const horaMadrid = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hour12: false }).format(new Date())) % 24;
const leer = async (sb, key) => (await sb.from("panel_config").select("value").eq("key", key).maybeSingle()).data?.value ?? null;
const guardar = (sb, key, value) => sb.from("panel_config").upsert({ key, value, updated_at: new Date().toISOString() }).then(() => undefined, () => undefined);
const enlacePortal = (m) => (config.panelUrl && m.portal_token ? `\n${config.panelUrl}/m/${m.portal_token}` : "");

async function api(metodo, cuerpo) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(`Telegram ${metodo} ${res.status}: ${String(j.description ?? "").slice(0, 140)}`);
  return j.result;
}
const enviar = (chat, texto) => api("sendMessage", { chat_id: chat, text: texto.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });

/** Manda un video por el bot (limite de Telegram: 50 MB). El video se baja de R2 y se sube como archivo. */
async function enviarVideo(chat, ruta, caption) {
  const form = new FormData();
  form.set("chat_id", String(chat));
  form.set("caption", caption.slice(0, 1000));
  form.set("parse_mode", "HTML");
  form.set("supports_streaming", "true");
  form.set("video", new Blob([await readFile(ruta)], { type: "video/mp4" }), "video.mp4");
  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendVideo`, { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(`Telegram sendVideo ${res.status}: ${String(j.description ?? "").slice(0, 140)}`);
}

/** El video de una pieza para mandarlo por Telegram: su vista previa (720p, ligera) o, si no existe, el original si cabe. null si no se puede. */
async function videoParaTelegram(pieza, destino) {
  const clave = pieza.r2_key_original ?? pieza.r2_key;
  if (!clave || clave.startsWith("supabase://")) return null;
  const prev = `previews/${hashOriginal(clave)}.mp4`;
  if (await existeEnR2(prev)) {
    await downloadFromR2(prev, destino);
    return destino;
  }
  if ((pieza.size_bytes ?? 0) > 0 && pieza.size_bytes < 45 * 1024 * 1024 && (await existeEnR2(clave))) {
    await downloadFromR2(clave, destino);
    return destino;
  }
  return null;
}

/** Retira de la captacion un reel que ya se ha mandado a la modelo con su feedback: borra la fila, el original y su vista previa (si ninguna otra pieza usa ese original). */
async function retirarPieza(sb, p) {
  const { error } = await sb.from("library_content").delete().eq("id", p.id).eq("estado", "recibido");
  if (error) {
    console.error("[telegram-modelos] retirar:", error.message);
    return;
  }
  for (const clave of new Set([p.r2_key_original, p.r2_key].filter((k) => k && /^(bruto\/|supabase:\/\/portal-uploads\/)/.test(k)))) {
    try {
      const [a, b] = await Promise.all([sb.from("library_content").select("id").eq("r2_key", clave).limit(1), sb.from("library_content").select("id").eq("r2_key_original", clave).limit(1)]);
      if ((a.data ?? []).length || (b.data ?? []).length) continue; // otra pieza sigue usando ese original
      if (clave.startsWith("supabase://")) {
        const sin = clave.slice("supabase://".length);
        const barra = sin.indexOf("/");
        await sb.storage.from(sin.slice(0, barra)).remove([sin.slice(barra + 1)]);
      } else {
        await borrarDeR2(clave);
        const h = hashOriginal(clave);
        await Promise.all([`previews/${h}.jpg`, `previews/${h}.mp4`].map((k) => borrarDeR2(k).catch(() => undefined)));
      }
    } catch (e) {
      console.error("[telegram-modelos] borrar archivo retirado:", e.message);
    }
  }
}

// ------------------------------------------------------------------------------------------------ vinculacion
/** Devuelve el id de la modelo si el codigo es valido (22 caracteres de id + 10 de firma), o null. */
export function modeloDeCodigo(codigo) {
  if (!config.cronSecret || typeof codigo !== "string" || codigo.length !== 32) return null;
  const hex = Buffer.from(codigo.slice(0, 22), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const esperado = Buffer.from(createHmac("sha256", config.cronSecret).update(id).digest("base64url").slice(0, 10));
  const recibido = Buffer.from(codigo.slice(22));
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido) ? id : null;
}

async function infoBot(sb) {
  if (Date.now() - ultimaInfoBot < 12 * 3600000) return;
  try {
    const me = await api("getMe");
    ultimaInfoBot = Date.now();
    await guardar(sb, "telegram_bot", { username: me.username });
  } catch (e) {
    ultimaInfoBot = Date.now() - 12 * 3600000 + 5 * 60000; // si falla, se reintenta en 5 minutos (no en 12 horas)
    console.error("[telegram-modelos] getMe:", e.message);
  }
}

export async function vincularModelos(sb) {
  const est = await leer(sb, "telegram_offset");
  const primeraVez = typeof est?.n !== "number";
  const url = new URL(`https://api.telegram.org/bot${config.telegramToken}/getUpdates`);
  url.searchParams.set("timeout", "0");
  url.searchParams.set("allowed_updates", JSON.stringify(["message"]));
  if (!primeraVez) url.searchParams.set("offset", String(est.n));
  const j = await fetch(url).then((r) => r.json()).catch(() => null);
  if (!j?.ok) return;
  const updates = j.result ?? [];
  const siguiente = updates.length ? Math.max(...updates.map((u) => u.update_id)) + 1 : primeraVez ? 0 : est.n;
  if (primeraVez) {
    await guardar(sb, "telegram_offset", { n: siguiente }); // lo anterior (p. ej. al configurar el bot) se descarta
    return;
  }
  for (const u of updates) {
    const msg = u.message;
    if (msg?.chat?.type !== "private") continue;
    const texto = String(msg.text ?? "").trim();
    if (!texto.startsWith("/start")) continue;
    const id = modeloDeCodigo(texto.split(/\s+/)[1]);
    try {
      if (!id) {
        await enviar(msg.chat.id, "👋 Para activar tus avisos, entra en tu portal y pulsa el botón «Activar avisos en Telegram».");
        continue;
      }
      const { data: modelo } = await sb.from("modelos").select("id, nombre").eq("id", id).maybeSingle();
      if (!modelo) continue;
      const { error } = await sb.from("modelos").update({ telegram_id: msg.chat.id }).eq("id", id);
      if (error) throw new Error(error.message);
      await enviar(msg.chat.id, `✅ ¡Listo, <b>${esc(modelo.nombre)}</b>! Te avisaremos por aquí de lo que te falte por hacer y de los comentarios del equipo sobre tus vídeos.`);
      console.log(`[telegram-modelos] ${modelo.nombre} ha activado sus avisos`);
    } catch (e) {
      console.error("[telegram-modelos] vincular:", e.message);
    }
  }
  if (siguiente !== est.n) await guardar(sb, "telegram_offset", { n: siguiente });
}

// ------------------------------------------------------------------------------------------------ feedback y revisiones (cola del panel)
export async function avisosModelos(sb) {
  const { data: cola, error } = await sb.from("telegram_cola").select("*").is("enviado_at", null).like("tipo", "modelo_%").order("created_at", { ascending: true }).limit(300);
  if (error || !cola?.length) return;
  const ahora = Date.now();
  const marcar = (ids) => (ids.length ? sb.from("telegram_cola").update({ enviado_at: new Date().toISOString() }).in("id", ids) : null);

  const ids = [...new Set(cola.map((e) => e.modelo_id).filter(Boolean))];
  const { data: modelos } = ids.length ? await sb.from("modelos").select("id, nombre, telegram_id, portal_token").in("id", ids) : { data: [] };
  const modelo = new Map((modelos ?? []).map((m) => [m.id, m]));

  const porModelo = new Map();
  for (const e of cola) porModelo.set(e.modelo_id, [...(porModelo.get(e.modelo_id) ?? []), e]);

  for (const [modeloId, lista] of porModelo) {
    const m = modelo.get(modeloId);
    const viejos = lista.filter((e) => ahora - new Date(e.created_at).getTime() > 6 * 3600000);
    if (!m?.telegram_id || viejos.length === lista.length) {
      await marcar(lista.map((e) => e.id)); // sin Telegram vinculado (o muy antiguo): no se envia
      continue;
    }
    try {
      // Feedback sobre reels: se espera a que acabe la racha de comentarios y se manda CADA VIDEO con su feedback (el ultimo que le hayas dado)
      const fb = lista.filter((e) => e.tipo === "modelo_feedback");
      if (fb.length) {
        const nuevo = Math.max(...fb.map((e) => new Date(e.created_at).getTime()));
        const viejo = Math.min(...fb.map((e) => new Date(e.created_at).getTime()));
        if (ahora - nuevo >= RACHA_QUIETA_MS || ahora - viejo >= RACHA_MAXIMA_MS) {
          const piezaIds = [...new Set(fb.map((e) => e.datos?.pieza_id).filter(Boolean))];
          const sinPieza = fb.filter((e) => !e.datos?.pieza_id);
          if (sinPieza.length) {
            const bien = sinPieza.filter((e) => e.datos?.tipo === "bien").length;
            const mejorar = sinPieza.filter((e) => e.datos?.tipo === "mejorar").length;
            const partes = [bien ? `✅ ${bien} van bien` : null, mejorar ? `⚠️ ${mejorar} para mejorar` : null].filter(Boolean).join(" · ");
            await enviar(m.telegram_id, `💬 <b>${esc(m.nombre)}</b>, el equipo ha revisado tus reels${partes ? `: ${partes}` : ""}.
Entra en «Subidos» para ver los comentarios.${enlacePortal(m)}`);
          }
          if (piezaIds.length) {
            const { data: piezas } = await sb.from("library_content").select("id, titulo, filename_original, r2_key, r2_key_original, size_bytes, estado, feedback_tipo, feedback_texto").in("id", piezaIds);
            const tmp = await mkdtemp(path.join(tmpdir(), "fb-"));
            try {
              let sinVideo = 0;
              for (const p of piezas ?? []) {
                if (p.feedback_tipo !== "bien" && p.feedback_tipo !== "mejorar") continue; // se quito el feedback antes de enviarlo
                if (p.estado !== "recibido") continue; // ya se mando a editar: no se toca
                if (p.feedback_tipo === "mejorar" && !p.feedback_texto) continue; // «Mejorar» sin comentario no se envia ni se retira: espera a que escribas que cambiar
                const mejorar = p.feedback_tipo === "mejorar";
                const etiqueta = mejorar ? "⚠️ <b>Para mejorar</b>" : "✅ <b>Va bien</b>";
                const base = `${etiqueta}${p.feedback_texto ? `\n💬 ${esc(p.feedback_texto)}` : ""}`;
                const caption = `${base}\n\n<i>${esc(m.nombre)}, este es el comentario del equipo sobre este vídeo.</i>`;
                try {
                  const ruta = await videoParaTelegram(p, path.join(tmp, `${p.id}.mp4`));
                  if (!ruta) throw new Error("sin video");
                  await enviarVideo(m.telegram_id, ruta, mejorar ? `${base}\n\n<i>${esc(m.nombre)}, graba otro con este cambio y súbelo en «Subir vídeos». Este lo hemos retirado.</i>` : caption);
                  if (mejorar) await retirarPieza(sb, p); // enviado: sale de la captacion (cuando suba el nuevo se revisa como uno mas)
                } catch (err) {
                  // Si el video no se puede mandar, al menos el comentario va como texto
                  console.error("[telegram-modelos] video de feedback:", err.message);
                  sinVideo++;
                  await enviar(m.telegram_id, `${caption}
🎬 ${esc(p.filename_original ?? p.titulo ?? "tu vídeo")}${enlacePortal(m)}`);
                }
                await new Promise((r) => setTimeout(r, 1200)); // limite de Telegram: ~1 mensaje por segundo en un chat
              }
              if (sinVideo === 0 && (piezas ?? []).some((p) => p.feedback_tipo === "bien")) await enviar(m.telegram_id, `Puedes volver a ver los comentarios en la pestaña «Subidos» de tu portal.${enlacePortal(m)}`);
            } finally {
              await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
            }
          }
          await marcar(fb.map((e) => e.id));
        }
      }
      // Videos descartados por el equipo (se juntan los de una misma tanda)
      const borr = lista.filter((e) => e.tipo === "modelo_borrado");
      if (borr.length) {
        const nuevo = Math.max(...borr.map((e) => new Date(e.created_at).getTime()));
        if (ahora - nuevo >= RACHA_QUIETA_MS / 4) {
          const nombres = borr.flatMap((e) => (Array.isArray(e.datos?.nombres) ? e.datos.nombres : []));
          const motivos = [...new Set(borr.map((e) => e.datos?.motivo).filter(Boolean))];
          const n = nombres.length || borr.length;
          const lineas = [`🗑 <b>${esc(m.nombre)}</b>, hemos descartado ${n === 1 ? "1 vídeo" : `${n} vídeos`} de los que subiste${nombres.length ? `: ${nombres.slice(0, 5).map((x) => `«${esc(x)}»`).join(", ")}${nombres.length > 5 ? "…" : ""}` : ""}.`];
          if (motivos.length) lineas.push(...motivos.map((x) => `💬 ${esc(x)}`));
          lineas.push("Cuando puedas, graba y sube otro para sustituirlo 🙌", enlacePortal(m).trim());
          await enviar(m.telegram_id, lineas.filter(Boolean).join("\n"));
          await marcar(borr.map((e) => e.id));
        }
      }
      // Asignacion de videos nuevos: se juntan los de una misma tanda (1 minuto sin mas)
      const asig = lista.filter((e) => e.tipo === "modelo_asignacion");
      if (asig.length) {
        const nuevo = Math.max(...asig.map((e) => new Date(e.created_at).getTime()));
        const viejo = Math.min(...asig.map((e) => new Date(e.created_at).getTime()));
        if (ahora - nuevo >= RACHA_QUIETA_MS || ahora - viejo >= RACHA_MAXIMA_MS) {
          const n = asig.reduce((s, e) => s + (Number(e.datos?.n) || 1), 0);
          await enviar(m.telegram_id, `🎬 <b>${esc(m.nombre)}</b>, tienes ${n} ${n === 1 ? "vídeo nuevo" : "vídeos nuevos"} por grabar.\nLo verás en tu portal, pestaña «Por grabar», con las indicaciones.${enlacePortal(m)}`);
          await marcar(asig.map((e) => e.id));
        }
      }
      // Avisos del equipo ("necesitamos ..."): al momento
      for (const e of lista.filter((x) => x.tipo === "modelo_aviso")) {
        const d = e.datos ?? {};
        const ETQ = { reels: "🎬 Reels", script: "📝 Scripts completos", pack: "📦 Packs de fotos", post: "🖼 Posts de OnlyFans", otro: "✨ Otro contenido" };
        const items = (Array.isArray(d.items) ? d.items : []).map((i) => `• ${i.cantidad ? i.cantidad + " " : ""}${ETQ[i.tipo] ?? i.tipo}`);
        const conOF = (Array.isArray(d.items) ? d.items : []).some((i) => ["script", "pack", "post"].includes(i.tipo));
        const partes = [`📣 <b>${esc(m.nombre)}</b>, el equipo necesita contenido tuyo:`];
        if (items.length) partes.push(...items);
        if (d.texto) partes.push(`💬 ${esc(d.texto)}`);
        if (conOF) partes.push("Para el contenido de OnlyFans sigue la pestaña «Guía OnlyFans» de tu portal, tal cual.");
        await enviar(m.telegram_id, `${partes.join("\n")}${enlacePortal(m)}`);
        await marcar([e.id]);
      }
      // Accesos que la agencia no ha podido usar: al momento
      for (const e of lista.filter((x) => x.tipo === "modelo_accesos_invalidos")) {
        const cual = e.datos?.cual === "skrill" ? "Skrill" : "OnlyFans";
        await enviar(m.telegram_id, `⚠️ <b>${esc(m.nombre)}</b>, no hemos podido entrar con tus accesos de ${cual}.\nEntra en tu portal y vuelve a escribirlos (te sale un aviso arriba, con el formulario).${enlacePortal(m)}`);
        await marcar([e.id]);
      }
      // Revision de scripts, packs y posts
      for (const e of lista.filter((x) => x.tipo === "modelo_revision")) {
        const d = e.datos ?? {};
        const etq = d.tipo === "script" ? "script" : d.tipo === "pack" ? "pack de fotos" : "post";
        const estado = d.revision === "aprobado" ? "✅ está aprobado, ¡buen trabajo!" : "⚠️ hay que mejorarlo";
        await enviar(m.telegram_id, `📝 Tu ${etq}${d.nombre ? ` «${esc(d.nombre)}»` : ""}: ${estado}${d.texto ? `\n💬 ${esc(d.texto)}` : ""}${enlacePortal(m)}`);
        await marcar([e.id]);
      }
    } catch (e) {
      console.error("[telegram-modelos] aviso:", e.message); // se reintenta en el siguiente ciclo
    }
  }
}

// ------------------------------------------------------------------------------------------------ recordatorio cada 3 dias
async function postsSubidos(sb, modeloId) {
  try {
    const { data } = await sb.from("of_colecciones").select("id").eq("modelo_id", modeloId).eq("tipo", "post").neq("nombre", "Historias elegidas");
    const ids = (data ?? []).map((c) => c.id);
    if (!ids.length) return 0;
    const { count } = await sb.from("of_archivos").select("id", { count: "exact", head: true }).in("coleccion_id", ids);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function pendientesDe(sb, m) {
  const cuenta = (q) => q.then((r) => r.count ?? 0, () => 0);
  const entregadas = (tipo) => sb.from("of_colecciones").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("tipo", tipo).eq("estado", "entregado");
  const [reels, scriptsEnt, scriptsOk, packs, posts, cuentas, encargos, aprobadosSinSalir, enCamino] = await Promise.all([
    cuenta(sb.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("origen", "upload_manual").or("tipo.is.null,tipo.not.in.(3,5)")),
    cuenta(entregadas("script")),
    sb.from("of_colecciones").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("tipo", "script").eq("estado", "entregado").eq("revision", "aprobado").then((r) => (r.error ? null : (r.count ?? 0))),
    cuenta(entregadas("pack")),
    postsSubidos(sb, m.id), // los posts van a una sola carpeta: cada archivo subido cuenta como un post
    cuenta(sb.from("cuentas_instagram").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("activa", true)),
    cuenta(sb.from("encargos").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).not("estado", "in", "(entregado,cancelado)")),
    cuenta(sb.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("estado", "aprobado").or(`publicado_at.is.null,publicado_at.gt.${new Date().toISOString()}`).or("tipo.is.null,tipo.not.in.(3,5)")),
    cuenta(sb.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).in("estado", ["en_aprobacion", "editando"]).or("tipo.is.null,tipo.not.in.(3,5)")),
  ]);
  // Dos bloques bien separados: los REELS (para su Instagram) y el contenido de ONLYFANS (scripts, packs y posts, que sigue la guia)
  const reelsFalta = [];
  const ofFalta = [];
  if (m.objetivo_videos && cuentas === 0) {
    if (reels < m.objetivo_videos) reelsFalta.push(`• Reels: ${reels}/${m.objetivo_videos}`);
    const objs = [
      ["Scripts completos (aprobados)", scriptsOk ?? scriptsEnt, m.objetivo_scripts ?? 4],
      ["Packs de fotos", packs, m.objetivo_packs ?? 5],
      ["Posts de OnlyFans", posts, m.objetivo_posts ?? 30],
    ];
    for (const [nombre, n, obj] of objs) if (n < obj) ofFalta.push(`• ${nombre}: ${n}/${obj} (mínimo)`);
  }
  // Poco contenido para publicar: con cuenta de Instagram, 2 reels al dia por cuenta; avisa si quedan 3 dias o menos
  const diasContenido = cuentas > 0 ? (aprobadosSinSalir + enCamino) / (cuentas * 2) : null;
  const stockBajo = diasContenido !== null && diasContenido <= 3 ? Math.round(diasContenido * 10) / 10 : null;
  const metas = { reelsFalta, ofFalta, stockBajo };
  return { metas, encargos };
}

export async function recordatorios(sb, { forzar = false, soloMostrar = false } = {}) {
  const h = horaMadrid();
  if (!forzar && (h < 10 || h >= 20 || Date.now() - ultimoRecordatorios < 30 * 60000)) return;
  ultimoRecordatorios = Date.now();

  let r = await sb.from("modelos").select("id, nombre, telegram_id, portal_token, objetivo_videos, objetivo_scripts, objetivo_packs, objetivo_posts").not("telegram_id", "is", null).eq("activa", true).is("eliminada_at", null);
  if (r.error) r = await sb.from("modelos").select("id, nombre, telegram_id, portal_token, objetivo_videos").not("telegram_id", "is", null).eq("activa", true);
  for (const m of r.data ?? []) {
    try {
      const previo = await leer(sb, `recordatorio:${m.id}`);
      if (!forzar && previo?.at && Date.now() - new Date(previo.at).getTime() < CADA_RECORDATORIO_MS) continue;
      const { metas, encargos } = await pendientesDe(sb, m);
      if (!metas.reelsFalta.length && !metas.ofFalta.length && !encargos && metas.stockBajo === null) continue;
      const lineas = [];
      if (metas.reelsFalta.length || metas.ofFalta.length) lineas.push("Esto te falta para empezar a trabajar con nosotros:");
      if (metas.reelsFalta.length) lineas.push("", "🎬 <b>Reels para tu Instagram</b>", ...metas.reelsFalta, "Súbelos en la pestaña «Subir vídeos».");
      if (metas.ofFalta.length) lineas.push("", "📦 <b>Contenido de OnlyFans</b>", ...metas.ofFalta, "Para esto, sigue la pestaña «Guía OnlyFans» de tu portal y hazlo exactamente como se indica (la guía es solo de OnlyFans, no de los reels).");
      if (encargos) lineas.push("", `🎬 Tienes ${encargos} ${encargos === 1 ? "vídeo" : "vídeos"} por grabar.`);
      if (metas.stockBajo !== null) lineas.push("", `⚠️ Te quedan pocos vídeos para publicar (unos ${metas.stockBajo} días de contenido): necesitamos que grabes y subas más reels.`);
      if (soloMostrar) {
        console.log(`📋 Hola ${m.nombre}\n${lineas.join("\n")}${enlacePortal(m)}`);
        continue;
      }
      await enviar(m.telegram_id, `📋 <b>Hola ${esc(m.nombre)}</b>\n${lineas.join("\n")}${enlacePortal(m)}`);
      await guardar(sb, `recordatorio:${m.id}`, { at: new Date().toISOString() });
    } catch (e) {
      console.error("[telegram-modelos] recordatorio:", e.message);
    }
  }
}

export async function cicloModelos(sb) {
  await infoBot(sb);
  await vincularModelos(sb);
  await avisosModelos(sb);
  await recordatorios(sb);
}
