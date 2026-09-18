/**
 * Handlers para cada tipo de vídeo.
 * Cada función recibe la pieza desde Supabase, descarga el bruto de R2,
 * procesa con ffmpeg/Whisper y sube el resultado de vuelta a R2.
 */

import { tmpdir } from "os";
import path from "path";
import { rm, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

import { downloadFromR2, uploadToR2, publicUrl } from "./r2.mjs";
import {
  extractAudio,
  transcribeWithWhisper,
  generateASS,
} from "./whisper.mjs";
import {
  renderTipo1,
  renderTipo2,
  renderTipo3,
  renderTipo4,
} from "./ffmpeg.mjs";

const TMP_DIR = process.env.TMP_DIR ?? "/tmp/halo-runner";

/**
 * Procesa una pieza de tipo 1 (hablando a cámara → subtítulos Whisper).
 * @param {object} pieza - Fila de library_content
 * @param {object} supabase - Cliente Supabase admin
 * @returns {string} r2_key del resultado
 */
export async function procesarTipo1(pieza, supabase) {
  const workDir = path.join(TMP_DIR, pieza.id);
  await mkdir(workDir, { recursive: true });

  try {
    const rawPath = path.join(workDir, "raw.mp4");
    const audioDir = path.join(workDir, "audio");
    const assPath = path.join(workDir, "subs.ass");
    const outPath = path.join(workDir, "output.mp4");

    // 1. Descargar bruto
    await downloadFromR2(pieza.r2_key, rawPath);

    // 2. Transcribir con Whisper
    const wavPath = await extractAudio(rawPath, audioDir);
    const segments = await transcribeWithWhisper(wavPath, audioDir);

    if (segments.length === 0) {
      console.warn(`[tipo1] Sin segmentos de audio para pieza ${pieza.id}`);
    }

    // 3. Generar archivo ASS
    const assContent = generateASS(segments);
    await writeFile(assPath, assContent, "utf-8");

    // 4. Renderizar con ffmpeg
    await renderTipo1(rawPath, assPath, outPath);

    // 5. Subir a R2
    const outKey = `editado/${pieza.id}_t1.mp4`;
    await uploadToR2(outPath, outKey);

    // 6. Actualizar Supabase
    await supabase
      .from("library_content")
      .update({ r2_key: outKey, estado: "en_aprobacion", estado_procesamiento: "listo", error_mensaje: null })
      .eq("id", pieza.id);

    return outKey;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Procesa una pieza de tipo 2 (caption → frase superpuesta + audio referencia).
 * @param {object} pieza
 * @param {object} supabase
 * @returns {string}
 */
export async function procesarTipo2(pieza, supabase) {
  const workDir = path.join(TMP_DIR, pieza.id);
  await mkdir(workDir, { recursive: true });

  try {
    const rawPath = path.join(workDir, "raw.mp4");
    const audioRefPath = path.join(workDir, "ref_audio.mp4");
    const outPath = path.join(workDir, "output.mp4");

    // 1. Descargar bruto
    await downloadFromR2(pieza.r2_key, rawPath);

    // 2. Descargar audio de referencia si existe
    let refAudio = undefined;
    if (pieza.r2_key_referencia) {
      await downloadFromR2(pieza.r2_key_referencia, audioRefPath);
      refAudio = audioRefPath;
    }

    // 3. Renderizar (frase del campo frase_quemada)
    await renderTipo2(rawPath, outPath, {
      frase: pieza.frase_quemada ?? "",
      audioRefPath: refAudio,
    });

    // 4. Subir a R2
    const outKey = `editado/${pieza.id}_t2.mp4`;
    await uploadToR2(outPath, outKey);

    // 5. Actualizar Supabase
    await supabase
      .from("library_content")
      .update({ r2_key: outKey, estado: "en_aprobacion", estado_procesamiento: "listo", error_mensaje: null })
      .eq("id", pieza.id);

    return outKey;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Procesa una pieza de tipo 3 (reto → subtítulos Whisper + freeze final).
 * @param {object} pieza
 * @param {object} supabase
 * @returns {string}
 */
export async function procesarTipo3(pieza, supabase) {
  const workDir = path.join(TMP_DIR, pieza.id);
  await mkdir(workDir, { recursive: true });

  try {
    const rawPath = path.join(workDir, "raw.mp4");
    const audioDir = path.join(workDir, "audio");
    const assPath = path.join(workDir, "subs.ass");
    const outPath = path.join(workDir, "output.mp4");

    // 1. Descargar bruto
    await downloadFromR2(pieza.r2_key, rawPath);

    // 2. Transcribir con Whisper
    const wavPath = await extractAudio(rawPath, audioDir);
    const segments = await transcribeWithWhisper(wavPath, audioDir);

    // 3. Generar ASS
    const assContent = generateASS(segments);
    await writeFile(assPath, assContent, "utf-8");

    // 4. Renderizar tipo 3 (con freeze frame)
    await renderTipo3(rawPath, assPath, outPath);

    // 5. Subir a R2
    const outKey = `editado/${pieza.id}_t3.mp4`;
    await uploadToR2(outPath, outKey);

    // 6. Actualizar Supabase
    await supabase
      .from("library_content")
      .update({ r2_key: outKey, estado: "en_aprobacion", estado_procesamiento: "listo", error_mensaje: null })
      .eq("id", pieza.id);

    return outKey;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Procesa una pieza de tipo 4 (con vídeo de referencia → copia exacta de estructura).
 * @param {object} pieza
 * @param {object} supabase
 * @returns {string}
 */
export async function procesarTipo4(pieza, supabase) {
  const workDir = path.join(TMP_DIR, pieza.id);
  await mkdir(workDir, { recursive: true });

  try {
    const rawPath = path.join(workDir, "raw.mp4");
    const refPath = path.join(workDir, "referencia.mp4");
    const outPath = path.join(workDir, "output.mp4");

    // 1. Descargar bruto y referencia
    await downloadFromR2(pieza.r2_key, rawPath);

    if (!pieza.r2_key_referencia) {
      throw new Error(`Tipo 4 sin r2_key_referencia para pieza ${pieza.id}`);
    }
    await downloadFromR2(pieza.r2_key_referencia, refPath);

    // 2. Transcribir el bruto si tiene audio hablado
    let assPath = null;
    if (pieza.tiene_locucion) {
      const audioDir = path.join(workDir, "audio");
      const wavPath = await extractAudio(rawPath, audioDir);
      const segments = await transcribeWithWhisper(wavPath, audioDir);
      if (segments.length > 0) {
        assPath = path.join(workDir, "subs.ass");
        const assContent = generateASS(segments);
        await writeFile(assPath, assContent, "utf-8");
      }
    }

    // 3. Renderizar tipo 4
    await renderTipo4(rawPath, refPath, outPath, assPath);

    // 4. Subir a R2
    const outKey = `editado/${pieza.id}_t4.mp4`;
    await uploadToR2(outPath, outKey);

    // 5. Actualizar Supabase
    await supabase
      .from("library_content")
      .update({ r2_key: outKey, estado: "en_aprobacion", estado_procesamiento: "listo", error_mensaje: null })
      .eq("id", pieza.id);

    return outKey;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
