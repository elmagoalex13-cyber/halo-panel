/**
 * HALO Runner (VPS)
 * Cola: library_content con estado='editando' y estado_procesamiento='pendiente'.
 * Por cada pieza: reclama (procesando) -> descarga bruto de R2 -> procesa segun tipo -> sube a
 * procesadas/<modelo>/<id>-tipoN.mp4 -> estado='en_aprobacion', estado_procesamiento='listo',
 * video_procesado_url. Si falla: estado_procesamiento='error' + error_mensaje (Rehacer lo reintenta).
 */
import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";
import { publicUrl } from "./r2.mjs";
import { procesarTipo } from "./tipos.mjs";
import { asignarFrase } from "./frases.mjs";
import { cicloScraper } from "./scraper.mjs";
import { descargarReferenciasPendientes } from "./referencias.mjs";
import { cicloTrials } from "./trials.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });

function tipoNumero(pieza) {
  if (Number.isInteger(pieza.tipo) && pieza.tipo >= 1 && pieza.tipo <= 4) return pieza.tipo;
  const m = String(pieza.tipo_video ?? "").match(/[1-4]/);
  return m ? Number(m[0]) : 1;
}

async function liberarAtascadas() {
  // Piezas que quedaron en 'procesando' (crash/reinicio) hace mas de 20 min vuelven a la cola
  const limite = new Date(Date.now() - 20 * 60000).toISOString();
  await supabase
    .from("library_content")
    .update({ estado_procesamiento: "pendiente" })
    .eq("estado", "editando")
    .eq("estado_procesamiento", "procesando")
    .lt("updated_at", limite);
}

async function reclamar(id) {
  const { data } = await supabase
    .from("library_content")
    .update({ estado_procesamiento: "procesando", error_mensaje: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado_procesamiento", "pendiente")
    .select("id");
  return (data?.length ?? 0) > 0;
}

async function procesarPieza(pieza) {
  const tipo = tipoNumero(pieza);
  console.log(`[runner] pieza ${pieza.id} tipo ${tipo}`);
  try {
    if (tipo === 2 && !pieza.frase_quemada) {
      pieza.frase_quemada = (await asignarFrase(supabase, pieza)) ?? "";
    }
    const { outKey, rawKey, fraseQuemada } = await procesarTipo(tipo, pieza);
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("library_content")
      .update({
        estado: "en_aprobacion",
        estado_procesamiento: "listo",
        video_procesado_url: publicUrl(outKey),
        r2_key_original: pieza.r2_key_original ?? rawKey,
        frase_quemada: fraseQuemada,
        error_mensaje: null,
        procesado_en: ahora,
        edicion_at: ahora,
        updated_at: ahora,
      })
      .eq("id", pieza.id);
    if (error) throw new Error(`Supabase: ${error.message}`);
    console.log(`[runner] OK ${pieza.id} -> ${outKey}`);
  } catch (err) {
    console.error(`[runner] ERROR ${pieza.id}:`, err.message);
    await supabase
      .from("library_content")
      .update({ estado_procesamiento: "error", error_mensaje: String(err.message).slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", pieza.id);
  }
}

let ocupado = false;
async function ciclo() {
  if (ocupado) return;
  ocupado = true;
  try {
    await liberarAtascadas();
    const { data: piezas, error } = await supabase
      .from("library_content")
      .select("id, modelo_id, cuenta_id, tipo, tipo_video, r2_key, r2_key_original, r2_key_referencia, audio_referencia_url, frase_quemada")
      .eq("estado", "editando")
      .eq("estado_procesamiento", "pendiente")
      .order("recibido_at", { ascending: true })
      .limit(config.maxPiezas);

    if (error) {
      console.error("[runner] error consultando la cola:", error.message);
      return;
    }
    for (const pieza of piezas ?? []) {
      if (await reclamar(pieza.id)) await procesarPieza(pieza);
    }
  } catch (err) {
    console.error("[runner] error inesperado en el ciclo:", err.message);
  } finally {
    ocupado = false;
  }
}

console.log(`HALO Runner v2 iniciado. Cola cada ${config.pollMs / 1000}s, max ${config.maxPiezas} piezas por vuelta`);
await ciclo();
setInterval(ciclo, config.pollMs);

// Referencias asignadas por URL: se descargan a R2 para que la modelo (y el editor) las vean
setTimeout(() => descargarReferenciasPendientes(supabase), 5000);
setInterval(() => descargarReferenciasPendientes(supabase), 10000);

// Scraper propio de cuentas de referencia (cada SCRAPER_HORAS; sin sesion de Instagram suele fallar)
console.log(`Scraper de referencias activo (cuentas cada ${config.scraperHoras}h, umbral viral x${config.scraperFactor} la mediana, sesion IG: ${config.igSessionId ? "si" : "NO"})`);
setTimeout(() => cicloScraper(supabase), 10000);
setInterval(() => cicloScraper(supabase), 60000);

// Trial reels: repone la cola de cada cuenta (3 al dia) con virales propios pasados por el spoofer
setTimeout(() => cicloTrials(supabase), 20000);
setInterval(() => cicloTrials(supabase), 5 * 60000);

// Pide al panel que programe en Publer lo pendiente (trial reels nuevos, aprobados sin fecha...)
async function avisarPanel() {
  if (!config.panelUrl || !config.cronSecret) return;
  try {
    const res = await fetch(`${config.panelUrl}/api/publer/programar`, { method: "POST", headers: { Authorization: `Bearer ${config.cronSecret}` } });
    if (!res.ok) console.error(`[panel] programar respondio ${res.status}`);
  } catch (err) {
    console.error("[panel] no se pudo avisar:", err.message);
  }
}
setInterval(avisarPanel, 10 * 60000);
