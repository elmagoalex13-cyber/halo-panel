/**
 * Avisos por Telegram. El panel anota los sucesos en la tabla telegram_cola y este modulo los envia, AGRUPADOS para no saturar el grupo:
 *   - subida:  "Rachel ha subido 5 videos (12/30)"  (una vez que termina la racha: 2 min sin mas subidas, o 8 min como maximo)
 *   - umbral:  llego al objetivo de captacion -> crear su cuenta de Instagram y aprobar el lote
 *   - lote:    se aprobo el lote (N videos a edicion)
 *   - accesos: la modelo envio sus accesos de OnlyFans y Skrill
 *   - prueba:  mensaje de prueba desde Ajustes
 * PRIVACIDAD: los avisos de modelos PRIVADAS (solo del dueño) NO van al grupo (donde esta el socio): van a TELEGRAM_CHAT_ID_PRIVADO si
 * esta definido, y si no, no se envian. Los de modelos compartidas van al grupo (TELEGRAM_CHAT_ID).
 * Configuracion en el .env del VPS: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID y (opcional) TELEGRAM_CHAT_ID_PRIVADO.
 */
import { config } from "./config.mjs";

const RACHA_QUIETA_MS = 2 * 60000;
const RACHA_MAXIMA_MS = 8 * 60000;
const CADUCA_MS = 6 * 3600000; // un aviso de hace mas de 6 h ya no sirve
let avisadoSinConfig = false;
let ultimoEstado = 0;

const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const plural = (n, uno, varios) => (n === 1 ? uno : varios);

async function enviar(chat, texto) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
}

async function guardarEstado(supabase, extra = {}) {
  if (Date.now() - ultimoEstado < 5 * 60000 && !extra.ahora) return;
  ultimoEstado = Date.now();
  await supabase
    .from("panel_config")
    .upsert({ key: "telegram_estado", value: { configurado: Boolean(config.telegramToken && config.telegramChat), privado: Boolean(config.telegramChatPrivado), at: new Date().toISOString(), ...extra }, updated_at: new Date().toISOString() })
    .then(() => undefined, () => undefined);
}

export async function cicloTelegram(supabase) {
  const configurado = Boolean(config.telegramToken && config.telegramChat);
  if (!configurado) {
    if (!avisadoSinConfig) {
      avisadoSinConfig = true;
      console.log("[telegram] sin TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en el .env: avisos por Telegram desactivados");
    }
    await guardarEstado(supabase);
    return;
  }

  const { data: cola, error } = await supabase.from("telegram_cola").select("*").is("enviado_at", null).order("created_at", { ascending: true }).limit(300);
  if (error || !cola?.length) {
    await guardarEstado(supabase);
    return;
  }
  const ahora = Date.now();
  const marcar = (ids) => (ids.length ? supabase.from("telegram_cola").update({ enviado_at: new Date().toISOString() }).in("id", ids) : null);

  // Caducados: se descartan sin enviar
  const vivos = [];
  const caducados = [];
  for (const e of cola) (ahora - new Date(e.created_at).getTime() > CADUCA_MS ? caducados : vivos).push(e);
  await marcar(caducados.map((e) => e.id));
  if (!vivos.length) return;

  // Datos de las modelos implicadas
  const ids = [...new Set(vivos.map((e) => e.modelo_id).filter(Boolean))];
  const { data: modelos } = ids.length ? await supabase.from("modelos").select("id, nombre, ambito, objetivo_videos, captacion_aprobada_at").in("id", ids) : { data: [] };
  const modelo = new Map((modelos ?? []).map((m) => [m.id, m]));
  const destino = (m) => (m?.ambito === "compartido" ? config.telegramChat : config.telegramChatPrivado || null);
  const panel = config.panelUrl || "";
  const enlace = (ruta) => (panel ? `\n${panel}${ruta}` : "");

  const mensajes = []; // { chat, texto, ids }

  // Subidas: se agrupan por modelo y se envian cuando acaba la racha
  const subidas = new Map();
  for (const e of vivos.filter((x) => x.tipo === "subida")) subidas.set(e.modelo_id, [...(subidas.get(e.modelo_id) ?? []), e]);
  for (const [modeloId, lista] of subidas) {
    const nuevo = Math.max(...lista.map((e) => new Date(e.created_at).getTime()));
    const viejo = Math.min(...lista.map((e) => new Date(e.created_at).getTime()));
    if (ahora - nuevo < RACHA_QUIETA_MS && ahora - viejo < RACHA_MAXIMA_MS) continue; // sigue subiendo: se espera
    const m = modelo.get(modeloId);
    const n = lista.reduce((s, e) => s + (Number(e.datos?.n) || 1), 0);
    let progreso = "";
    if (m?.objetivo_videos && !m.captacion_aprobada_at) {
      const { count } = await supabase.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", modeloId).eq("origen", "upload_manual").or("tipo.is.null,tipo.neq.5");
      progreso = ` (${count ?? "?"}/${m.objetivo_videos})`;
    }
    mensajes.push({ chat: destino(m), texto: `📥 <b>${esc(m?.nombre ?? "Una modelo")}</b> ha subido ${n} ${plural(n, "vídeo", "vídeos")}${progreso}`, ids: lista.map((e) => e.id) });
  }

  for (const e of vivos.filter((x) => x.tipo !== "subida")) {
    const m = modelo.get(e.modelo_id);
    const nombre = esc(m?.nombre ?? "Una modelo");
    let texto = null;
    let chat = destino(m);
    if (e.tipo === "umbral") texto = `✅ <b>${nombre}</b> ya ha subido sus ${Number(e.datos?.objetivo) || m?.objetivo_videos || ""} vídeos.\n👉 Crea su cuenta de Instagram y aprueba el lote.${enlace("/modelos")}`;
    else if (e.tipo === "lote") texto = `🎬 Lote de <b>${nombre}</b> aprobado: ${Number(e.datos?.n) || 0} vídeos en cola de edición.`;
    else if (e.tipo === "accesos") texto = `🔑 <b>${nombre}</b> ha ${e.datos?.actualizacion ? "actualizado" : "enviado"} sus accesos de OnlyFans y Skrill (están en el Vault${m?.ambito === "compartido" ? " compartido" : ""}).${enlace("/vault")}`;
    else if (e.tipo === "prueba") {
      texto = "✅ Telegram conectado: los avisos del panel llegarán a este grupo.";
      chat = config.telegramChat;
    }
    mensajes.push({ chat, texto, ids: [e.id] });
  }

  for (const msg of mensajes) {
    if (!msg.chat || !msg.texto) {
      await marcar(msg.ids); // modelo privada sin chat privado configurado: no se envia al grupo
      continue;
    }
    try {
      await enviar(msg.chat, msg.texto);
      await marcar(msg.ids);
      await guardarEstado(supabase, { ahora: true, ultimo_envio: new Date().toISOString() });
    } catch (e) {
      console.error("[telegram]", e.message);
      await guardarEstado(supabase, { ahora: true, error: String(e.message).slice(0, 200) });
      break; // se reintenta en el siguiente ciclo
    }
  }
}
