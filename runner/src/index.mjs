/**
 * HALO Runner (VPS)
 * Cola: library_content con estado='editando' y estado_procesamiento='pendiente'.
 * Por cada pieza: reclama (procesando) -> descarga bruto de R2 -> procesa segun tipo -> sube a
 * procesadas/<modelo>/<id>-tipoN.mp4 -> estado='en_aprobacion', estado_procesamiento='listo',
 * video_procesado_url. Si falla: estado_procesamiento='error' + error_mensaje (Rehacer lo reintenta).
 */
import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";
import { iniciarTrabajadores } from "./queue.mjs";
import { latido } from "./salud.mjs";
import { backupDb } from "./backup_db.mjs";
import { cicloScraper } from "./scraper.mjs";
import { descargarReferenciasPendientes } from "./referencias.mjs";
import { cicloTrials } from "./trials.mjs";
import { backupOnboarding } from "./backup_onboarding.mjs";
import { cicloVenuz } from "./venuz.mjs";
import { cicloPreviews } from "./previews.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });

const pieceTimeoutMinutes = Number.isFinite(config.pieceTimeoutMs) ? Math.round(config.pieceTimeoutMs / 60000) : 18;
console.log(`HALO Runner v2 iniciado. Cola cada ${config.pollMs / 1000}s, max ${config.maxPiezas} piezas por vuelta, concurrencia ${config.runnerConcurrency}, ffmpeg ${config.ffmpegPreset}/crf${config.ffmpegCrf}/threads${config.ffmpegThreads}, timeout pieza ${pieceTimeoutMinutes}m`);
// Trabajadores continuos (sin esperar a que acabe una "vuelta" para coger la siguiente pieza)
iniciarTrabajadores();

// Latido para el panel (aviso si el editor deja de responder o la cola se atasca)
setTimeout(() => latido(supabase), 5000);
setInterval(() => latido(supabase), 60000);

// Copia de seguridad nocturna de la base de datos (una vez al dia, a partir de las 03:00 UTC)
setTimeout(() => backupDb(supabase).catch((e) => console.error("[backup]", e.message)), 60000);
setInterval(() => backupDb(supabase).catch((e) => console.error("[backup]", e.message)), 30 * 60000);

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

// Facturacion de Venuz.ai: refresca cada VENUZ_HORAS y cuando el panel pulsa "Sync Venuz" (se mira cada 30 s)
setTimeout(() => cicloVenuz(supabase), 15000);
setInterval(() => cicloVenuz(supabase), 30000);

// Vistas previas (miniatura + copia ligera) de los originales de las modelos, para la pagina Originales del panel
setTimeout(() => cicloPreviews(supabase), 25000);
setInterval(() => cicloPreviews(supabase), 30000);

// Copia de seguridad del onboarding de creadoras (disco del VPS + bucket privado de Supabase).
// Solo escribe si hubo cambios y nunca borra copias antiguas.
setTimeout(() => backupOnboarding(supabase), 30000);
setInterval(() => backupOnboarding(supabase), 15 * 60000);
