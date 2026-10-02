import "dotenv/config";

function intEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function durationMsEnv(name, fallbackMinutes, { minMinutes = 1, maxMinutes = 120 } = {}) {
  const parsed = parseFloat(process.env[name] ?? "");
  const minutes = Number.isFinite(parsed) ? parsed : fallbackMinutes;
  return Math.round(Math.min(maxMinutes, Math.max(minMinutes, minutes)) * 60000);
}

function strEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

// Mismo contrato de variables que el .env desplegado en el VPS (deploy-runner.sh).
export const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  r2Endpoint:
    process.env.R2_ENDPOINT ?? (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined),
  r2Key: process.env.R2_ACCESS_KEY_ID,
  r2Secret: process.env.R2_SECRET_ACCESS_KEY,
  r2Bucket: process.env.R2_BUCKET ?? process.env.R2_BUCKET_NAME ?? "halo-videos",
  r2PublicUrl: (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, ""),
  pollMs: intEnv("POLL_INTERVAL_MS", 5000, { min: 3000, max: 15000 }),
  maxPiezas: intEnv("MAX_PIEZAS", intEnv("MAX_PIEZAS_POR_VUELTA", 1, { min: 1, max: 12 }), { min: 1, max: 12 }),
  runnerConcurrency: intEnv("RUNNER_CONCURRENCY", 1, { min: 1, max: 4 }),
  stuckMinutes: intEnv("STUCK_PROCESSING_MINUTES", 6, { min: 2, max: 60 }),
  tmpDir: process.env.TMP_DIR ?? "/tmp/halo-runner",
  ffmpeg: process.env.FFMPEG_BIN ?? "ffmpeg",
  ffprobe: process.env.FFPROBE_BIN ?? "ffprobe",
  ffmpegPreset: strEnv("FFMPEG_PRESET", "fast"),
  ffmpegCrf: strEnv("FFMPEG_CRF", "16"),
  ffmpegThreads: intEnv("FFMPEG_THREADS", 4, { min: 1, max: 8 }),
  commandTimeoutMs: durationMsEnv("COMMAND_TIMEOUT_MINUTES", 10, { minMinutes: 2, maxMinutes: 60 }),
  pieceTimeoutMs: durationMsEnv("PIECE_TIMEOUT_MINUTES", 18, { minMinutes: 5, maxMinutes: 120 }),
  igSessionId: process.env.IG_SESSIONID,
  igCsrf: process.env.IG_CSRFTOKEN,
  igCookie: process.env.IG_COOKIE,
  trialFactor: parseFloat(process.env.TRIAL_FACTOR ?? "1.5"),
  trialMaxUsos: parseInt(process.env.TRIAL_MAX_USOS ?? "5", 10),
  trialColchon: parseInt(process.env.TRIAL_COLCHON ?? "9", 10),
  trialHoras: parseFloat(process.env.TRIAL_HORAS ?? "3"),
  panelUrl: (process.env.PANEL_URL ?? "").replace(/\/+$/, ""),
  backupDir: strEnv("BACKUP_DIR", "/opt/halo-backups"),
  cronSecret: process.env.CRON_SECRET,
  scraperDias: parseInt(process.env.SCRAPER_DIAS ?? "14", 10),
  scraperHoras: parseFloat(process.env.SCRAPER_HORAS ?? "24"),
  scraperMaxReels: parseInt(process.env.SCRAPER_MAX_REELS ?? "30", 10),
  scraperFactor: parseFloat(process.env.SCRAPER_FACTOR ?? "1.5"),
  whisperBin: process.env.WHISPER_BIN,
  whisperModel: process.env.WHISPER_MODEL,
  openaiKey: process.env.OPENAI_API_KEY,
  openaiVisionModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
};

export function faltanVariables() {
  const falta = [];
  if (!config.supabaseUrl) falta.push("SUPABASE_URL");
  if (!config.supabaseKey) falta.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.r2Endpoint) falta.push("R2_ACCOUNT_ID (o R2_ENDPOINT)");
  if (!config.r2Key) falta.push("R2_ACCESS_KEY_ID");
  if (!config.r2Secret) falta.push("R2_SECRET_ACCESS_KEY");
  return falta;
}
