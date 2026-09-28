/**
 * HALO Runner (VPS)
 * Cola: library_content con estado='editando' y estado_procesamiento='pendiente'.
 * Por cada pieza: reclama (procesando) -> descarga bruto de R2 -> procesa segun tipo -> sube a
 * procesadas/<modelo>/<id>-tipoN.mp4 -> estado='en_aprobacion', estado_procesamiento='listo',
 * video_procesado_url. Si falla: estado_procesamiento='error' + error_mensaje (Rehacer lo reintenta).
 */
import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";
import { cicloOnce } from "./queue.mjs";
import { cicloScraper } from "./scraper.mjs";
import { descargarReferenciasPendientes } from "./referencias.mjs";
import { cicloTrials } from "./trials.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });

let ocupado = false;
async function ciclo() {
  if (ocupado) return;
  ocupado = true;
  try {
    await cicloOnce();
  } catch (err) {
    console.error("[runner] error inesperado en el ciclo:", err.message);
  } finally {
    ocupado = false;
  }
}

const pieceTimeoutMinutes = Number.isFinite(config.pieceTimeoutMs) ? Math.round(config.pieceTimeoutMs / 60000) : 18;
console.log(`HALO Runner v2 iniciado. Cola cada ${config.pollMs / 1000}s, max ${config.maxPiezas} piezas por vuelta, concurrencia ${config.runnerConcurrency}, ffmpeg ${config.ffmpegPreset}/crf${config.ffmpegCrf}/threads${config.ffmpegThreads}, timeout pieza ${pieceTimeoutMinutes}m`);
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
