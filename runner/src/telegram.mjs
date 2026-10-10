/**
 * Avisos por Telegram, pensados para NO llenar el grupo aunque haya muchas modelos:
 *
 *  - RESUMEN DIARIO (1 mensaje al dia, a las TELEGRAM_RESUMEN_HORA hora de Madrid, por defecto 21): cuantos reels ha subido cada modelo
 *    ese dia y cuantos esperan aprobacion. Si no hubo subidas, no se envia nada. Los videos sueltos NO generan avisos.
 *  - AL MOMENTO, solo lo importante y poco frecuente (cola telegram_cola, la rellena el panel):
 *      umbral    -> una modelo llego al objetivo de captacion: crear su cuenta de Instagram y aprobar el lote
 *      of_entrega-> una modelo ENTREGO un script, un pack o un post de OnlyFans (uno por entrega, no por archivo)
 *      accesos   -> una modelo envio sus accesos
 *      prueba    -> mensaje de prueba desde Ajustes
 *  - AL DUEÑO (chat privado, nunca al grupo): lo sensible que hace tu socio (borrar contraseñas, mandar una modelo a la papelera...).
 *
 * PRIVACIDAD: lo de modelos PRIVADAS (solo del dueño) NO va al grupo (donde esta el socio): va a TELEGRAM_CHAT_ID_PRIVADO si esta
 * definido y, si no, no se envia. Lo de modelos compartidas va al grupo (TELEGRAM_CHAT_ID).
 * Configuracion en el .env del VPS: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_CHAT_ID_PRIVADO (opcional), TELEGRAM_RESUMEN_HORA (opcional).
 */
import { config } from "./config.mjs";
import { cicloModelos } from "./telegram_modelos.mjs";

const CADUCA_MS = 6 * 3600000; // un aviso de hace mas de 6 h ya no sirve
const ZONA = "Europe/Madrid";
const HORA_RESUMEN = Math.min(23, Math.max(0, parseInt(process.env.TELEGRAM_RESUMEN_HORA ?? "21", 10) || 21));
let avisadoSinConfig = false;
let ultimoEstado = 0;

const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const plural = (n, uno, varios) => (n === 1 ? uno : varios);

async function enviar(chat, texto) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
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

const leerConfig = async (supabase, key) => (await supabase.from("panel_config").select("value").eq("key", key).maybeSingle()).data?.value ?? null;
const guardarConfig = (supabase, key, value) => supabase.from("panel_config").upsert({ key, value, updated_at: new Date().toISOString() }).then(() => undefined, () => undefined);

// ------------------------------------------------------------------------------------------------ cola de avisos importantes
async function colaInmediata(supabase) {
  const { data: cola, error } = await supabase.from("telegram_cola").select("*").is("enviado_at", null).not("tipo", "like", "modelo_%").order("created_at", { ascending: true }).limit(300);
  if (error || !cola?.length) return;
  const ahora = Date.now();
  const marcar = (ids) => (ids.length ? supabase.from("telegram_cola").update({ enviado_at: new Date().toISOString() }).in("id", ids) : null);

  const vivos = [];
  const descartar = [];
  for (const e of cola) {
    // caducados y tipos que ya no generan aviso (subida suelta, lote aprobado): se limpian sin enviar
    if (ahora - new Date(e.created_at).getTime() > CADUCA_MS || e.tipo === "subida" || e.tipo === "lote") descartar.push(e.id);
    else vivos.push(e);
  }
  await marcar(descartar);
  if (!vivos.length) return;

  const ids = [...new Set(vivos.map((e) => e.modelo_id).filter(Boolean))];
  const { data: modelos } = ids.length ? await supabase.from("modelos").select("id, nombre, ambito, objetivo_videos").in("id", ids) : { data: [] };
  const modelo = new Map((modelos ?? []).map((m) => [m.id, m]));
  const destino = (m) => (m?.ambito === "compartido" ? config.telegramChat : config.telegramChatPrivado || null);
  const panel = config.panelUrl || "";
  const enlace = (ruta) => (panel ? `\n${panel}${ruta}` : "");
  const mensajes = []; // { chat, texto, ids }

  // Entregas de OnlyFans: una por script/pack/post; si una modelo entrega varias de golpe, un solo mensaje
  const entregas = new Map();
  for (const e of vivos.filter((x) => x.tipo === "of_entrega")) entregas.set(e.modelo_id, [...(entregas.get(e.modelo_id) ?? []), e]);
  const ETIQ = { script: "un script", pack: "un pack", post: "fotos para un post" };
  for (const [modeloId, lista] of entregas) {
    const m = modelo.get(modeloId);
    const nombre = esc(m?.nombre ?? "Una modelo");
    const linea = (e) => `${ETIQ[e.datos?.tipo] ?? "contenido"}${e.datos?.nombre ? ` «${esc(e.datos.nombre)}»` : ""} (${Number(e.datos?.archivos) || "?"} archivos)`;
    const texto =
      lista.length === 1
        ? `📦 <b>${nombre}</b> ha entregado ${linea(lista[0])} de OnlyFans.${enlace("/onlyfans")}`
        : `📦 <b>${nombre}</b> ha entregado ${lista.length} cosas de OnlyFans:\n${lista.map((e) => `• ${linea(e)}`).join("\n")}${enlace("/onlyfans")}`;
    mensajes.push({ chat: destino(m), texto, ids: lista.map((e) => e.id) });
  }

  for (const e of vivos.filter((x) => x.tipo !== "of_entrega")) {
    const m = modelo.get(e.modelo_id);
    const nombre = esc(m?.nombre ?? "Una modelo");
    let texto = null;
    let chat = destino(m);
    if (e.tipo === "umbral") {
      const d = e.datos ?? {};
      const mins = [d.reels && `${d.reels} reels`, d.scripts && `${d.scripts} scripts aprobados`, d.packs && `${d.packs} packs`, d.posts && `${d.posts} posts`].filter(Boolean).join(", ");
      texto = `✅ <b>${nombre}</b> ya cumple todos los mínimos${mins ? ` (${mins})` : ""}.\n👉 Crea su cuenta de Instagram y revisa/aprueba sus reels.${enlace("/modelos")}`;
    }
    else if (e.tipo === "accesos") texto = `🔑 <b>${nombre}</b> ha ${e.datos?.actualizacion ? "actualizado" : "enviado"} ${e.datos?.parcial ? "su acceso de OnlyFans" : "sus accesos de OnlyFans y Skrill"} (está en el Vault${m?.ambito === "compartido" ? " compartido" : ""}).${enlace("/vault")}`;
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
      return; // se reintenta en el siguiente ciclo
    }
  }
}

// ------------------------------------------------------------------------------------------------ lo sensible del socio -> chat PRIVADO del dueño
export async function actividadDelSocio(supabase, { desde = null, soloMostrar = false } = {}) {
  if (!config.telegramChatPrivado && !soloMostrar) return;
  const cursor = desde ? { at: desde } : await leerConfig(supabase, "telegram_cursor_actividad");
  if (!cursor?.at) {
    await guardarConfig(supabase, "telegram_cursor_actividad", { at: new Date().toISOString() }); // primera vez: no se manda el historico
    return;
  }
  const { data: filas, error } = await supabase
    .from("panel_actividad")
    .select("usuario, accion, ids, created_at")
    .eq("sensible", true)
    .gt("created_at", cursor.at)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error || !filas?.length) return;
  // Se espera a que acabe la racha (1 min sin movimientos) para agrupar, p. ej. al borrar varias contraseñas seguidas
  const ultima = new Date(filas[filas.length - 1].created_at).getTime();
  if (Date.now() - ultima < 60000 && !soloMostrar) return;

  const idsAfectados = [...new Set(filas.flatMap((f) => f.ids ?? []))];
  const nombres = new Map();
  if (idsAfectados.length) {
    const [mo, va, ci] = await Promise.all([
      supabase.from("modelos").select("id, nombre").in("id", idsAfectados),
      supabase.from("vault_panel").select("id, nombre").in("id", idsAfectados),
      supabase.from("cuentas_instagram").select("id, username").in("id", idsAfectados),
    ]);
    for (const x of mo.data ?? []) nombres.set(x.id, `modelo ${x.nombre}`);
    for (const x of va.data ?? []) nombres.set(x.id, `Vault: ${x.nombre}`);
    for (const x of ci.data ?? []) nombres.set(x.id, `cuenta @${x.username}`);
  }
  const grupos = new Map();
  for (const f of filas) {
    const k = `${f.usuario}|${f.accion}`;
    const g = grupos.get(k) ?? { usuario: f.usuario, accion: f.accion, n: 0, sobre: new Set() };
    g.n++;
    for (const id of f.ids ?? []) if (nombres.has(id)) g.sobre.add(nombres.get(id));
    grupos.set(k, g);
  }
  const lineas = [...grupos.values()].map((g) => `• <b>${esc(g.usuario)}</b>: ${esc(g.accion.toLowerCase())}${g.n > 1 ? ` (${g.n} veces)` : ""}${g.sobre.size ? ` — ${esc([...g.sobre].slice(0, 4).join(", "))}` : ""}`);
  const texto = `⚠️ <b>Acciones sensibles de tu socio</b>\n${lineas.join("\n")}${config.panelUrl ? `\n${config.panelUrl}/logs?origen=usuarios` : ""}`;
  if (soloMostrar) {
    console.log(texto);
    return;
  }
  try {
    await enviar(config.telegramChatPrivado, `⚠️ <b>Acciones sensibles de tu socio</b>\n${lineas.join("\n")}${config.panelUrl ? `\n${config.panelUrl}/logs?origen=usuarios` : ""}`);
    await guardarConfig(supabase, "telegram_cursor_actividad", { at: filas[filas.length - 1].created_at });
  } catch (e) {
    console.error("[telegram] actividad del socio:", e.message);
  }
}

// ------------------------------------------------------------------------------------------------ resumen diario
const diaMadrid = () => new Date().toLocaleDateString("sv-SE", { timeZone: ZONA });
const horaMadrid = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hour12: false }).format(new Date())) % 24;

export async function resumenDiario(supabase, { forzar = false, soloMostrar = false } = {}) {
  if (!forzar && horaMadrid() < HORA_RESUMEN) return;
  const hoy = diaMadrid();
  const previo = soloMostrar ? null : await leerConfig(supabase, "telegram_resumen");
  if (!forzar && previo?.dia === hoy) return;

  const desde = new Date(Date.now() - 24 * 3600000).toISOString();
  const subidas = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await supabase
      .from("library_content")
      .select("modelo_id")
      .eq("origen", "upload_manual")
      .or("tipo.is.null,tipo.neq.5")
      .gte("recibido_at", desde)
      .range(desdeFila, desdeFila + 999);
    if (error) return;
    subidas.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  if (!soloMostrar) await guardarConfig(supabase, "telegram_resumen", { dia: hoy });
  if (!subidas.length) {
    if (soloMostrar) console.log("(sin subidas en las ultimas 24 h: no se enviaria nada)");
    return;
  }

  const porModelo = new Map();
  for (const s of subidas) porModelo.set(s.modelo_id, (porModelo.get(s.modelo_id) ?? 0) + 1);
  const { data: modelos } = await supabase.from("modelos").select("id, nombre, ambito, objetivo_videos, captacion_aprobada_at").in("id", [...porModelo.keys()]);

  const armar = async (lista, titulo) => {
    if (!lista.length) return null;
    lista.sort((a, b) => (porModelo.get(b.id) ?? 0) - (porModelo.get(a.id) ?? 0));
    const total = lista.reduce((s, m) => s + (porModelo.get(m.id) ?? 0), 0);
    const { count: enAprobacion } = await supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "en_aprobacion").in("modelo_id", lista.map((m) => m.id));
    const lineas = [];
    for (const m of lista.slice(0, 25)) {
      let cap = "";
      if (m.objetivo_videos && !m.captacion_aprobada_at) {
        const { count } = await supabase.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("origen", "upload_manual").or("tipo.is.null,tipo.not.in.(3,5)");
        cap = ` · captación ${count ?? "?"}/${m.objetivo_videos}`;
      }
      const n = porModelo.get(m.id) ?? 0;
      lineas.push(`• <b>${esc(m.nombre)}</b> — ${n} ${plural(n, "reel", "reels")}${cap}`);
    }
    if (lista.length > 25) lineas.push(`…y ${lista.length - 25} más`);
    return `📊 <b>${titulo}</b>\n${lineas.join("\n")}\n\nTotal: ${total} ${plural(total, "reel", "reels")} de ${lista.length} ${plural(lista.length, "modelo", "modelos")} · ${enAprobacion ?? 0} esperando aprobación${config.panelUrl ? `\n${config.panelUrl}/aprobacion` : ""}`;
  };

  const compartidas = (modelos ?? []).filter((m) => m.ambito === "compartido");
  const privadas = (modelos ?? []).filter((m) => m.ambito !== "compartido");
  if (soloMostrar) {
    console.log("--- GRUPO ---\n" + ((await armar(compartidas, "Resumen de hoy")) ?? "(nada para el grupo)"));
    console.log("--- CHAT PRIVADO ---\n" + ((await armar(privadas, "Resumen de hoy · tus modelos")) ?? "(nada para el chat privado)"));
    return;
  }
  try {
    const t1 = await armar(compartidas, "Resumen de hoy");
    if (t1) await enviar(config.telegramChat, t1);
    const t2 = config.telegramChatPrivado ? await armar(privadas, "Resumen de hoy · tus modelos") : null;
    if (t2) await enviar(config.telegramChatPrivado, t2);
  } catch (e) {
    console.error("[telegram] resumen:", e.message);
    await guardarConfig(supabase, "telegram_resumen", { dia: previo?.dia ?? null }); // se reintenta
  }
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
  await colaInmediata(supabase);
  await actividadDelSocio(supabase);
  await resumenDiario(supabase);
  await cicloModelos(supabase).catch((e) => console.error("[telegram-modelos]", e.message)); // avisos privados a las modelos
  await guardarEstado(supabase);
}
