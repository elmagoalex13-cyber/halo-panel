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
import { extractAudio, transcribeWithWhisper, generateASS } from "./whisper.mjs";
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
    const assPath = path.join(workDir, "subs.ass");
    await writeFile(assPath, generateASS(segments), "utf-8");
    return assPath;
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
      await renderTipo1(rawPath, await subtitulos(rawPath, workDir), outPath);
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
      await renderTipo3(rawPath, await subtitulos(rawPath, workDir), outPath);
    } else {
      const refKey = keyDesdeUrl(pieza.r2_key_referencia);
      if (!refKey) throw new Error("Tipo 4 sin video de referencia (r2_key_referencia)");
      const refPath = path.join(workDir, "referencia.mp4");
      await downloadFromR2(refKey, refPath);
      await renderTipo4(rawPath, refPath, outPath, await subtitulos(rawPath, workDir));
    }

    await uploadToR2(outPath, outKey);
    return { outKey, rawKey };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
