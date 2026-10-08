/**
 * Mueve los ORIGINALES que estan en Supabase Storage (bucket portal-uploads) a R2 (bruto/<modelo>/<archivo>) y deja Supabase
 * Storage vacio (el plan gratuito de Supabase solo da 1 GB de almacenamiento y 5 GB de descargas al mes).
 * Por cada original: lo descarga, lo sube a R2, COMPRUEBA que el tamano coincide, actualiza las filas de library_content que lo
 * usan, copia su vista previa a la clave nueva y solo entonces borra el de Supabase. Se puede repetir sin problema.
 *
 *   node src/migrar_a_r2.mjs            -> migra
 *   node src/migrar_a_r2.mjs --simular  -> solo cuenta lo que haria
 */
import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.mjs";
import { uploadToR2 } from "./r2.mjs";
import { hashOriginal } from "./previews.mjs";

const SIMULAR = process.argv.includes("--simular");
const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
const s3 = new S3Client({ region: "auto", endpoint: config.r2Endpoint, credentials: { accessKeyId: config.r2Key, secretAccessKey: config.r2Secret }, forcePathStyle: true });
const tmp = path.join(config.tmpDir, "migracion");

const tamanoR2 = async (Key) => {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: config.r2Bucket, Key }));
    return Number(r.ContentLength ?? 0);
  } catch {
    return null;
  }
};

async function copiarPreview(viejo, nuevo) {
  for (const ext of ["jpg", "mp4"]) {
    const origen = `previews/${hashOriginal(viejo)}.${ext}`;
    const destino = `previews/${hashOriginal(nuevo)}.${ext}`;
    if ((await tamanoR2(origen)) === null || (await tamanoR2(destino)) !== null) continue;
    await s3.send(new CopyObjectCommand({ Bucket: config.r2Bucket, CopySource: `${config.r2Bucket}/${origen}`, Key: destino }));
    await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: origen }));
  }
}

const { data: filas, error } = await supabase.from("library_content").select("id, r2_key, r2_key_original, size_bytes").like("r2_key", "supabase://%");
if (error) throw error;
const claves = [...new Set((filas ?? []).flatMap((f) => [f.r2_key, f.r2_key_original]).filter((k) => k?.startsWith("supabase://portal-uploads/")))];
console.log(`${claves.length} originales en Supabase Storage${SIMULAR ? " (simulacion)" : ""}`);

let ok = 0;
let fallos = 0;
for (const vieja of claves) {
  const [modelo, ...resto] = vieja.slice("supabase://portal-uploads/".length).split("/");
  const archivo = resto.join("/");
  const nueva = `bruto/${modelo}/${archivo}`;
  if (SIMULAR) {
    console.log(`  ${vieja} -> ${nueva}`);
    continue;
  }
  const destino = path.join(tmp, archivo);
  try {
    await mkdir(tmp, { recursive: true });
    const { data, error: errDescarga } = await supabase.storage.from("portal-uploads").download(`${modelo}/${archivo}`);
    if (errDescarga || !data) throw new Error(`descarga: ${errDescarga?.message ?? "vacia"}`);
    await pipeline(Readable.fromWeb(data.stream()), createWriteStream(destino));
    const tam = (await stat(destino)).size;
    if (!tam) throw new Error("archivo vacio");

    await uploadToR2(destino, nueva, data.type || "video/quicktime");
    const enR2 = await tamanoR2(nueva);
    if (enR2 !== tam) throw new Error(`el tamano no coincide (supabase ${tam}, r2 ${enR2})`);

    for (const col of ["r2_key", "r2_key_original"]) {
      const { error: errUpd } = await supabase.from("library_content").update({ [col]: nueva }).eq(col, vieja);
      if (errUpd) throw new Error(`base de datos (${col}): ${errUpd.message}`);
    }
    await copiarPreview(vieja, nueva);
    const { error: errBorrar } = await supabase.storage.from("portal-uploads").remove([`${modelo}/${archivo}`]);
    if (errBorrar) console.error(`  aviso: movido pero no se pudo borrar de Supabase: ${errBorrar.message}`);
    ok++;
    console.log(`  OK (${ok}/${claves.length}) ${nueva} · ${(tam / 1e6).toFixed(0)} MB`);
  } catch (e) {
    fallos++;
    console.error(`  FALLO ${vieja}: ${e.message}`);
  } finally {
    await rm(destino, { force: true });
  }
}
console.log(`Terminado: ${ok} movidos, ${fallos} con fallo.`);
process.exit(fallos ? 1 : 0);
