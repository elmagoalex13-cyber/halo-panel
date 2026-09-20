/**
 * Handlers por tipo de video. Devuelven { outKey, rawKey }; NO tocan la BD (lo hace index.mjs).
 *  tipo 1 = hablando (subtitulos Whisper)
 *  tipo 2 = caption/gesto (frase del banco quemada + audio de referencia opcional)
 *  tipo 3 = reto (subtitulos + freeze final)
 *  tipo 4 = con referencia (mismo recorte/duracion que la referencia)
 */
import path from "path";
import { createWriteStream } from "fs";
import { rm, writeFile, mkdir } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { config } from "./config.mjs";
import { downloadFromR2, uploadToR2, keyDesdeUrl } from "./r2.mjs";
import {
  compactSubtitleSegments,
  detectAudioStart,
  extractAudio,
  generateASS,
  speechBounds,
  subtitleSegmentsFromText,
  transcriptText,
  transcribeWithWhisper,
} from "./whisper.mjs";
import { renderTipo1, renderTipo2, renderTipo3, renderTipo4 } from "./ffmpeg.mjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });

async function downloadInput(key, destPath) {
  if (key.startsWith("supabase://")) {
    const withoutScheme = key.slice("supabase://".length);
    const slash = withoutScheme.indexOf("/");
    const bucket = withoutScheme.slice(0, slash);
    const objectPath = withoutScheme.slice(slash + 1);
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
    if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? "no se pudo descargar"}`);
    await mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(Readable.fromWeb(data.stream()), createWriteStream(destPath));
    return;
  }
  await downloadFromR2(key, destPath);
}

async function subtitulos(rawPath, workDir, textoCorregido = "") {
  try {
    const audioDir = path.join(workDir, "audio");
    const wavPath = await extractAudio(rawPath, audioDir);
    const [segments, audioStart] = await Promise.all([
      transcribeWithWhisper(wavPath, audioDir),
      detectAudioStart(wavPath),
    ]);
    if (!segments.length) {
      console.warn("[runner] sin segmentos de voz (o whisper no instalado): se renderiza sin subtitulos");
      return null;
    }
    const trim = speechBounds(segments, { audioStart });
    const textoWhisper = transcriptText(segments);
    const textoFinal = textoCorregido.trim() || textoWhisper;
    const compact = textoCorregido.trim()
      ? subtitleSegmentsFromText(textoFinal, trim, 4)
      : compactSubtitleSegments(segments, 4);
    const assPath = path.join(workDir, "subs.ass");
    await writeFile(assPath, generateASS(compact, { offset: trim?.start ?? 0 }), "utf-8");
    return { assPath, trim, texto: textoFinal };
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
    let fraseQuemada = pieza.frase_quemada ?? "";
    await downloadInput(rawKey, rawPath);

    if (tipo === 1) {
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "");
      await renderTipo1(rawPath, subs?.assPath, outPath, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
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
      fraseQuemada = pieza.frase_quemada ?? "";
    } else if (tipo === 3) {
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "");
      await renderTipo3(rawPath, subs?.assPath, outPath, 2, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
    } else {
      const refKey = keyDesdeUrl(pieza.r2_key_referencia);
      if (!refKey) throw new Error("Tipo 4 sin video de referencia (r2_key_referencia)");
      const refPath = path.join(workDir, "referencia.mp4");
      await downloadFromR2(refKey, refPath);
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "");
      await renderTipo4(rawPath, refPath, outPath, subs?.assPath, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
    }

    await uploadToR2(outPath, outKey);
    return { outKey, rawKey, fraseQuemada };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
