import "dotenv/config";

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
  pollMs: parseInt(process.env.POLL_INTERVAL_MS ?? "15000", 10),
  maxPiezas: parseInt(process.env.MAX_PIEZAS ?? process.env.MAX_PIEZAS_POR_VUELTA ?? "3", 10),
  tmpDir: process.env.TMP_DIR ?? "/tmp/halo-runner",
  ffmpeg: process.env.FFMPEG_BIN ?? "ffmpeg",
  ffprobe: process.env.FFPROBE_BIN ?? "ffprobe",
  apifyToken: process.env.APIFY_TOKEN,
  scraperActor: process.env.SCRAPER_ACTOR ?? "apify~instagram-reel-scraper",
  scraperHoras: parseFloat(process.env.SCRAPER_HORAS ?? "24"),
  scraperMaxReels: parseInt(process.env.SCRAPER_MAX_REELS ?? "30", 10),
  scraperFactor: parseFloat(process.env.SCRAPER_FACTOR ?? "1.5"),
  whisperBin: process.env.WHISPER_BIN,
  whisperModel: process.env.WHISPER_MODEL,
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
