/**
 * Vistas previas de los ORIGINALES que suben las modelos (pagina "Originales" del panel).
 * Los .MOV de iPhone suelen venir en HEVC y muchos navegadores no los reproducen, asi que para cada
 * original se genera una miniatura (jpg) y una copia ligera en H.264 (360x640 aprox.) que si se ve en
 * cualquier navegador. El original NO se toca: es solo para echarle un vistazo.
 *   previews/<hash>.jpg   miniatura
 *   previews/<hash>.mp4   copia ligera para reproducir (se sube la ultima: su existencia = "listo")
 * <hash> = sha1(clave del original)[0..20]; el panel calcula el mismo y lista previews/ para saber cuales hay.
 */
import { createHash } from "crypto";
import { execFile } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { config } from "./config.mjs";
import { downloadFromR2, listarClaves, uploadToR2 } from "./r2.mjs";

const execFileAsync = promisify(execFile);
const ES_ORIGINAL = /^(bruto\/|supabase:\/\/portal-uploads\/)/;
const POR_VUELTA = 2;

export const hashOriginal = (clave) => createHash("sha1").update(clave).digest("hex").slice(0, 20);

async function descargarOriginal(supabase, key, destino) {
  await mkdir(path.dirname(destino), { recursive: true });
  if (key.startsWith("supabase://")) {
    const sin = key.slice("supabase://".length);
    const barra = sin.indexOf("/");
    const { data, error } = await supabase.storage.from(sin.slice(0, barra)).download(sin.slice(barra + 1));
    if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? "no se pudo descargar"}`);
    await pipeline(Readable.fromWeb(data.stream()), createWriteStream(destino));
    return;
  }
  await downloadFromR2(key, destino);
}

// nice: que no le quite CPU a la cola de edicion
const ffmpeg = (args) => execFileAsync("nice", ["-n", "10", config.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: 6 * 60000, maxBuffer: 8 * 1024 * 1024 });

async function generar(supabase, clave) {
  const h = hashOriginal(clave);
  const dir = path.join(config.tmpDir, "previews", h);
  const entrada = path.join(dir, "original");
  const poster = path.join(dir, "poster.jpg");
  const video = path.join(dir, "preview.mp4");
  try {
    await descargarOriginal(supabase, clave, entrada);
    // Miniatura (fotograma al segundo 1; si el video es mas corto, el primero)
    try {
      await ffmpeg(["-ss", "1", "-i", entrada, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", poster]);
    } catch {
      await ffmpeg(["-i", entrada, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", poster]);
    }
    // Copia ligera para reproducir (alto 640, hasta 2 min)
    await ffmpeg([
      "-i", entrada, "-t", "120",
      "-vf", "scale=-2:640:flags=bicubic,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-threads", "2",
      "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
      video,
    ]);
    await uploadToR2(poster, `previews/${h}.jpg`, "image/jpeg");
    await uploadToR2(video, `previews/${h}.mp4`, "video/mp4");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let enMarcha = false;
const fallidos = new Set(); // originales que no se pudieron procesar (corruptos...): no reintentar en bucle

/** Genera las vistas previas que falten, los originales mas nuevos primero. Se llama cada ~30 s. */
export async function cicloPreviews(supabase) {
  if (enMarcha) return;
  enMarcha = true;
  try {
    // Originales vivos (los borrados a mano tienen original_borrado_at; si la columna aun no existe se ignora)
    const consulta = (conBorrado) => {
      let q = supabase.from("library_content").select("r2_key, r2_key_original").eq("origen", "upload_manual").order("recibido_at", { ascending: false }).limit(600);
      if (conBorrado) q = q.is("original_borrado_at", null);
      return q;
    };
    let { data, error } = await consulta(true);
    if (error) ({ data, error } = await consulta(false));
    if (error) return;

    const claves = Array.from(new Set((data ?? []).map((p) => p.r2_key_original ?? p.r2_key).filter((k) => k && ES_ORIGINAL.test(k))));
    if (!claves.length) return;
    const hechos = new Set((await listarClaves("previews/")).filter((k) => k.endsWith(".mp4")).map((k) => k.slice("previews/".length, -4)));
    const faltan = claves.filter((k) => !hechos.has(hashOriginal(k)) && !fallidos.has(k));
    if (!faltan.length) return;

    console.log(`[previews] ${faltan.length} original(es) sin vista previa`);
    for (const clave of faltan.slice(0, POR_VUELTA)) {
      const t0 = Date.now();
      try {
        await generar(supabase, clave);
        console.log(`[previews] ok ${hashOriginal(clave)} (${Math.round((Date.now() - t0) / 1000)} s)`);
      } catch (err) {
        fallidos.add(clave);
        console.error(`[previews] fallo ${hashOriginal(clave)}: ${String(err.message).slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.error("[previews] error inesperado:", err.message);
  } finally {
    enMarcha = false;
  }
}
