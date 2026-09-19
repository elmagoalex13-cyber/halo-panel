/**
 * Handlers por tipo de video. Devuelven { outKey, rawKey }; NO tocan la BD (lo hace index.mjs).
 *  tipo 1 = hablando (subtitulos Whisper)
 *  tipo 2 = caption/gesto (frase del banco quemada + audio de referencia opcional)
 *  tipo 3 = reto (subtitulos + freeze final)
 *  tipo 4 = con referencia (mismo recorte/duracion que la referencia)
 */
import path from "path";
import { rm, writeFile, mkdir } from "fs/promises";
import { config } from "./config.mjs";
import { downloadFromR2, uploadToR2, keyDesdeUrl } from "./r2.mjs";
import { compactSubtitleSegments, detectAudioStart, extractAudio, generateASS, speechBounds, transcribeWithWhisper } from "./whisper.mjs";
import { renderTipo1, renderTipo2, renderTipo3, renderTipo4 } from "./ffmpeg.mjs";

async function subtitulos(rawPath, workDir) {
  try {
    const audioDir = path.join(workDir, "audio");
    const wavPath = await extractAudio(rawPath, audioDir);
    const segments = await transcribeWithWhisper(wavPath, audioDir);
    if (!segments.length) {
      console.warn("[runner] sin segmentos de voz (o whisper no instalado): se renderiza sin subtitulos");
      return null;
    }
    const audioStart = await detectAudioStart(wavPath);
    const trim = speechBounds(segments, { audioStart });
    const compact = compactSubtitleSegments(segments, 4);
    const assPath = path.join(workDir, "subs.ass");
    await writeFile(assPath, generateASS(compact, { offset: trim?.start ?? 0 }), "utf-8");
    return { assPath, trim };
  } catch (err) {
    console.warn("[runner] fallo whisper, se renderiza sin subtitulos:", err.message);
    return null;
  }
}

export async function procesarTipo(tipo, pieza) {
  const workDir = path.join(config.tmpDir, pieza.id);
  await mkdir(workDir, { recursive: true });
  const rawKey = pieza.r2_key_original ?? keyDesdeUrl(pieza.r2_key);
  if (!rawKey) throw new Error("La pieza no tiene r2_key");
  const outKey = `procesadas/${pieza.modelo_id}/${pieza.id}-tipo${tipo}.mp4`;

  try {
    const rawPath = path.join(workDir, "raw.mp4");
    const outPath = path.join(workDir, "output.mp4");
    await downloadFromR2(rawKey, rawPath);

    if (tipo === 1) {
      const subs = await subtitulos(rawPath, workDir);
      await renderTipo1(rawPath, subs?.assPath, outPath, { trim: subs?.trim });
    } else if (tipo === 2) {
      let audioRef;
      const refKey = keyDesdeUrl(pieza.audio_referencia_url);
      if (refKey) {
        audioRef = path.join(workDir, "ref_audio.mp4");
        try {
          await downloadFromR2(refKey, audioRef);
        } catch {
          audioRef = undefined;
        }
      }
      await renderTipo2(rawPath, outPath, { frase: pieza.frase_quemada ?? "", audioRefPath: audioRef });
    } else if (tipo === 3) {
      const subs = await subtitulos(rawPath, workDir);
      await renderTipo3(rawPath, subs?.assPath, outPath, 2, { trim: subs?.trim });
    } else {
      const refKey = keyDesdeUrl(pieza.r2_key_referencia);
      if (!refKey) throw new Error("Tipo 4 sin video de referencia (r2_key_referencia)");
      const refPath = path.join(workDir, "referencia.mp4");
      await downloadFromR2(refKey, refPath);
      const subs = await subtitulos(rawPath, workDir);
      await renderTipo4(rawPath, refPath, outPath, subs?.assPath, { trim: subs?.trim });
    }

    await uploadToR2(outPath, outKey);
    return { outKey, rawKey };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
