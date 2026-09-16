/**
 * Agente Spoofer: procesa trial reels pendientes.
 * - Consulta trial_reels con estado = 'pendiente_spoofer'
 * - Descarga la pieza original de R2
 * - Aplica variaciones técnicas (recorte, zoom, eq de color)
 * - Sube el resultado spoofeado a R2
 * - Actualiza el estado a 'pendiente_aprobacion'
 * - Notifica al admin por Telegram
 */

import path from "path";
import { rm, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";

import { downloadFromR2, uploadToR2, publicUrl } from "./r2.mjs";
import { renderSpoofer } from "./ffmpeg.mjs";
import { notificarTrialListo, notificarError } from "./telegram.mjs";

const TMP_DIR = process.env.TMP_DIR ?? "/tmp/halo-runner";

/**
 * Genera parámetros de spoofer dentro de los rangos permitidos.
 * Usamos variaciones aleatorias pequeñas para que cada versión sea técnicamente diferente.
 * @returns {object} Parámetros del spoofer
 */
function generarParamsSpoofer() {
  const rand = (min, max, decimals = 2) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

  return {
    trim_start: rand(0.8, 1.5, 1),
    trim_end: rand(0.8, 1.5, 1),
    zoom: rand(1.02, 1.05, 3),
    brightness: rand(0.98, 1.03, 3),
    contrast: rand(0.97, 1.04, 3),
    saturation: rand(0.96, 1.05, 3),
  };
}

/**
 * Calcula el SHA-256 de un archivo.
 * @param {string} filePath
 * @returns {string} Hash hexadecimal
 */
async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Procesa todos los trial reels pendientes de spoofer.
 * @param {object} supabase - Cliente Supabase admin
 */
export async function procesarTrialsPendientes(supabase) {
  const { data: pendientes, error } = await supabase
    .from("trial_reels")
    .select(`
      id, cuenta_id, pieza_origen_r2_key, pieza_origen_tipo,
      spoofer_params,
      cuenta:cuentas_instagram(username, modelo_id),
      modelo:modelos(nombre)
    `)
    .eq("estado", "pendiente_spoofer")
    .limit(3);

  if (error) {
    console.error("[spoofer] Error al consultar trial_reels:", error.message);
    return;
  }

  if (!pendientes || pendientes.length === 0) return;

  console.log(`[spoofer] ${pendientes.length} trial reel(s) pendientes de spoofer`);

  for (const trial of pendientes) {
    await procesarUnTrialReel(trial, supabase);
  }
}

/**
 * Procesa un trial reel individual.
 * @param {object} trial - Fila de trial_reels
 * @param {object} supabase
 */
async function procesarUnTrialReel(trial, supabase) {
  const workDir = path.join(TMP_DIR, `trial_${trial.id}`);
  await mkdir(workDir, { recursive: true });

  const cuentaUsername = trial.cuenta?.username ?? trial.cuenta_id;
  const modeloNombre = trial.modelo?.nombre ?? "—";

  try {
    console.log(`[spoofer] Procesando trial ${trial.id} — @${cuentaUsername}`);

    const rawPath = path.join(workDir, "original.mp4");
    const outPath = path.join(workDir, "spoofeado.mp4");

    // 1. Descargar original
    if (!trial.pieza_origen_r2_key) {
      throw new Error(`Trial ${trial.id} sin pieza_origen_r2_key`);
    }
    await downloadFromR2(trial.pieza_origen_r2_key, rawPath);

    // 2. Calcular SHA-256 del original
    const sha256 = await sha256File(rawPath);

    // 3. Generar parámetros del spoofer (o usar los ya asignados)
    const params = trial.spoofer_params ?? generarParamsSpoofer();

    // 4. Renderizar
    await renderSpoofer(rawPath, outPath, params);

    // 5. Subir spoofeado a R2
    const outKey = `trial/${trial.id}_spoofeado.mp4`;
    await uploadToR2(outPath, outKey);

    // 6. Actualizar trial en Supabase
    await supabase
      .from("trial_reels")
      .update({
        estado: "pendiente_aprobacion",
        storage_path_spoofeado: outKey,
        sha256_original: sha256,
        spoofer_params: params,
        spoofeado_at: new Date().toISOString(),
      })
      .eq("id", trial.id);

    console.log(`[spoofer] Trial ${trial.id} listo → ${outKey}`);

    // 7. Notificar al admin
    await notificarTrialListo({
      cuenta: cuentaUsername,
      modelo: modeloNombre,
      usos: 0, // el contador de usos se actualiza al aprobar
    });
  } catch (err) {
    console.error(`[spoofer] Error en trial ${trial.id}:`, err.message);

    // Marcar como error en Supabase
    await supabase
      .from("trial_reels")
      .update({ estado: "error_spoofer" })
      .eq("id", trial.id);

    await notificarError(`Spoofer trial ${trial.id}`, err);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
