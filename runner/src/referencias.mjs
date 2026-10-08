/**
 * Descarga a R2 los videos de referencia que el panel asigna por URL (tabla referencias con url_r2 nulo).
 * Sirve enlaces de reels de Instagram o URLs directas de video. La modelo ve el video en su portal y,
 * en el tipo 4, el editor lo usa como guia (r2_key_referencia).
 */
import { rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { descargarUrl } from "./descarga.mjs";
import { publicUrl, uploadToR2 } from "./r2.mjs";
import { infoDeUrl } from "./instagram.mjs";

const intentos = new Map(); // id -> { n, ultimo }  (se guarda en panel_config para que sobreviva a los reinicios)
const MAX_INTENTOS = 5;
let corriendo = false;
let cargados = false;
const CLAVE_FALLOS = "referencias_fallos";

async function cargarFallos(supabase) {
  if (cargados) return;
  cargados = true;
  const { data } = await supabase.from("panel_config").select("value").eq("key", CLAVE_FALLOS).maybeSingle();
  for (const [id, v] of Object.entries(data?.value ?? {})) intentos.set(id, v);
}

async function guardarFallos(supabase) {
  await supabase.from("panel_config").upsert({ key: CLAVE_FALLOS, value: Object.fromEntries(intentos), updated_at: new Date().toISOString() }).then(() => undefined, () => undefined);
}

export async function descargarReferenciasPendientes(supabase) {
  if (corriendo) return;
  corriendo = true;
  try {
    await cargarFallos(supabase);
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
      await guardarFallos(supabase);
      const dir = path.join(config.tmpDir, "referencias");
      const mp4 = path.join(dir, `${ref.id}.mp4`);
      try {
        const info = await infoDeUrl(ref.url_original);
        await descargarUrl(info.videoUrl, mp4);
        const key = `referencias/asignadas/${ref.id}.mp4`;
        await uploadToR2(mp4, key, "video/mp4");
        let thumb = ref.thumbnail_url;
        if (info.miniatura && !thumb) {
          const jpg = path.join(dir, `${ref.id}.jpg`);
          try {
            await descargarUrl(info.miniatura, jpg);
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
        intentos.delete(ref.id);
        await guardarFallos(supabase);
        console.log(`[referencias] descargada ${ref.url_original} -> ${key}`);
      } catch (err) {
        console.error(`[referencias] ${ref.url_original}: ${err.message}${previo.n + 1 >= MAX_INTENTOS ? " (ya son " + MAX_INTENTOS + " fallos: no se vuelve a intentar)" : ""}`);
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
