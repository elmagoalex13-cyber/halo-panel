/**
 * Descarga a R2 los videos de referencia que el panel asigna por URL (tabla referencias con url_r2 nulo).
 * Sirve enlaces de reels de Instagram o URLs directas de video. La modelo ve el video en su portal y,
 * en el tipo 4, el editor lo usa como guia (r2_key_referencia).
 */
import { mkdir, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { config } from "./config.mjs";
import { publicUrl, uploadToR2 } from "./r2.mjs";
import { infoDeUrl } from "./instagram.mjs";

const intentos = new Map(); // id -> { n, ultimo }
const MAX_INTENTOS = 5;
let corriendo = false;

async function descargar(url, destino) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok || !res.body) throw new Error(`Descarga ${res.status}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
}

export async function descargarReferenciasPendientes(supabase) {
  if (corriendo) return;
  corriendo = true;
  try {
    const { data } = await supabase
      .from("referencias")
      .select("id, url_original, thumbnail_url, descripcion")
      .is("url_r2", null)
      .eq("activa", true)
      .order("created_at", { ascending: true })
      .limit(5);
    for (const ref of data ?? []) {
      const previo = intentos.get(ref.id) ?? { n: 0, ultimo: 0 };
      if (previo.n >= MAX_INTENTOS || Date.now() - previo.ultimo < 5 * 60000) continue;
      intentos.set(ref.id, { n: previo.n + 1, ultimo: Date.now() });
      const dir = path.join(config.tmpDir, "referencias");
      const mp4 = path.join(dir, `${ref.id}.mp4`);
      try {
        const info = await infoDeUrl(ref.url_original);
        await descargar(info.videoUrl, mp4);
        const key = `referencias/asignadas/${ref.id}.mp4`;
        await uploadToR2(mp4, key, "video/mp4");
        let thumb = ref.thumbnail_url;
        if (info.miniatura && !thumb) {
          const jpg = path.join(dir, `${ref.id}.jpg`);
          try {
            await descargar(info.miniatura, jpg);
            await uploadToR2(jpg, `referencias/asignadas/${ref.id}.jpg`, "image/jpeg");
            thumb = publicUrl(`referencias/asignadas/${ref.id}.jpg`);
          } catch {
            /* la miniatura es opcional */
          } finally {
            await rm(jpg, { force: true });
          }
        }
        await supabase
          .from("referencias")
          .update({ url_r2: key, thumbnail_url: thumb, descripcion: ref.descripcion ?? info.descripcion ?? null, updated_at: new Date().toISOString() })
          .eq("id", ref.id);
        console.log(`[referencias] descargada ${ref.url_original} -> ${key}`);
      } catch (err) {
        console.error(`[referencias] ${ref.url_original}: ${err.message}`);
      } finally {
        await rm(mp4, { force: true });
      }
    }
  } catch (err) {
    console.error("[referencias] error inesperado:", err.message);
  } finally {
    corriendo = false;
  }
}
