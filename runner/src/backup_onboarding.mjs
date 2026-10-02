/**
 * Copia de seguridad del onboarding de creadoras, INDEPENDIENTE de las tablas:
 * si alguien borra filas (o desactiva los triggers de proteccion), las copias
 * siguen existiendo.
 *
 *  - Disco del VPS: <BACKUP_DIR>/onboarding/onboarding-<fecha>.json (otro proveedor que Supabase).
 *  - Supabase Storage, bucket PRIVADO "backups-privados" (no R2: su bucket es publico y
 *    esto son datos personales).
 *
 * Solo escribe cuando algo cambio (hash del contenido). NUNCA borra copias antiguas.
 * Si detecta menos filas que en la copia anterior, lo avisa en el log a gritos.
 */
import crypto from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

const BUCKET = "backups-privados";
let ultimoHash = null;
let ultimoRecuento = null;
let bucketListo = false;

async function leerTodo(supabase, tabla, columnas, orden) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).order(orden, { ascending: true }).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

async function asegurarBucket(supabase) {
  if (bucketListo) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`);
  }
  bucketListo = true;
}

export async function backupOnboarding(supabase) {
  try {
    const dir = path.join(config.backupDir, "onboarding");
    await mkdir(dir, { recursive: true });

    const [actual, historial, modelos] = await Promise.all([
      leerTodo(supabase, "modelo_onboarding", "modelo_id, datos, estado, enviado_at, created_at, updated_at", "modelo_id"),
      leerTodo(supabase, "modelo_onboarding_historial", "id, modelo_id, datos, origen, created_at", "created_at"),
      leerTodo(supabase, "modelos", "id, nombre", "id"),
    ]);
    const recuento = { actual: actual.length, historial: historial.length };
    if (!recuento.actual && !recuento.historial && (ultimoRecuento === null || (!ultimoRecuento.actual && !ultimoRecuento.historial))) return;

    // Primera vez tras arrancar: toma de referencia la copia mas reciente del disco.
    if (ultimoRecuento === null) {
      const archivos = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
      if (archivos.length) {
        try {
          const previa = JSON.parse(await readFile(path.join(dir, archivos.at(-1)), "utf8"));
          ultimoRecuento = { actual: previa.actual?.length ?? 0, historial: previa.historial?.length ?? 0 };
        } catch {
          ultimoRecuento = { actual: 0, historial: 0 };
        }
      } else {
        ultimoRecuento = { actual: 0, historial: 0 };
      }
    }
    if (recuento.actual < ultimoRecuento.actual || recuento.historial < ultimoRecuento.historial) {
      console.error(
        `[backup-onboarding] !!! HAN DESAPARECIDO FILAS en la base de datos (antes ${JSON.stringify(ultimoRecuento)}, ahora ${JSON.stringify(recuento)}). Las copias antiguas siguen intactas en ${dir}`,
      );
    }

    const nombres = Object.fromEntries(modelos.map((m) => [m.id, m.nombre]));
    const contenido = JSON.stringify({ generado: new Date().toISOString(), nombres, actual, historial }, null, 2);
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ actual, historial }))
      .digest("hex");
    if (hash === ultimoHash) return;

    // Si el estado en disco ya coincide con el hash (reinicio del runner), no duplica.
    const sello = new Date().toISOString().replace(/[:.]/g, "-");
    const nombre = `onboarding-${sello}.json`;
    const archivoHash = path.join(dir, ".ultimo-hash");
    let hashDisco = null;
    try {
      hashDisco = (await readFile(archivoHash, "utf8")).trim();
    } catch {}
    if (hashDisco === hash) {
      ultimoHash = hash;
      ultimoRecuento = recuento;
      return;
    }

    await writeFile(path.join(dir, nombre), contenido, "utf8");
    await writeFile(archivoHash, hash, "utf8");

    try {
      await asegurarBucket(supabase);
      const { error } = await supabase.storage.from(BUCKET).upload(`onboarding/${nombre}`, Buffer.from(contenido, "utf8"), {
        contentType: "application/json",
        upsert: false,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error("[backup-onboarding] copia en Supabase Storage fallo (la del disco si se guardo):", err.message);
    }

    ultimoHash = hash;
    ultimoRecuento = recuento;
    console.log(`[backup-onboarding] copia guardada: ${nombre} (${recuento.actual} onboardings, ${recuento.historial} versiones)`);
  } catch (err) {
    console.error("[backup-onboarding] error:", err.message);
  }
}
