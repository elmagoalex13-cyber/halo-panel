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
  alignCorrectedText,
  chunkWordTimed,
  detectVoiceOnset,
  extractAudio,
  limitesDeVoz,
  perfilDeNivel,
  generateASS,
  primerTramoSospechoso,
  speechBounds,
  transcriptText,
  transcribeWithWhisper,
  wordTimedFromSegments,
} from "./whisper.mjs";
import { getDuration, renderTipo1, renderTipo2, renderTipo3, renderTipo4 } from "./ffmpeg.mjs";
import { DURACION_TIPO2, dividirEnFragmentos, planificarFragmentos } from "./fragmentos.mjs";
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

async function subtitulos(rawPath, workDir, textoCorregido = "", recorteManual = {}) {
  try {
    const audioDir = path.join(workDir, "audio");
    const wavPath = await extractAudio(rawPath, audioDir);
    const segments = await transcribeWithWhisper(wavPath, audioDir);
    if (!segments.length) {
      console.warn("[runner] sin segmentos de voz (o whisper no instalado): se renderiza sin subtitulos");
      return null;
    }
    // Recorte manual desde la mesa de aprobacion (segundos sobre el video
    // bruto): tiene prioridad sobre la deteccion automatica. Si solo se dio
    // uno de los dos limites, el otro se sigue calculando automaticamente.
    const inicioManual = Number.isFinite(recorteManual.inicio) ? Math.max(0, recorteManual.inicio) : null;
    const finManual = Number.isFinite(recorteManual.fin) ? recorteManual.fin : null;

    // 1) Limites de la VOZ medidos en el audio (nivel cada 20 ms). Whisper alarga el primer y el ultimo tramo
    //    (primera palabra en el 0 cuando la voz entra en el 0,8; ultima palabra con 2 s de silencio detras),
    //    asi que el video no empezaba/acababa justo donde se habla. Whisper solo sirve de guia de donde buscar.
    const guia = speechBounds(segments);
    const frames = guia ? await perfilDeNivel(wavPath) : null;
    const voz = guia && frames ? limitesDeVoz(frames, { primeraPalabra: guia.start, ultimaPalabraFin: guia.end }) : null;

    // 2) Sin contraste suficiente (ruido constante...) se vuelve al metodo anterior: timestamp de Whisper, y solo si el
    //    primer tramo es sospechoso se corrige el inicio por volumen.
    const voiceOnset = !voz && inicioManual === null && primerTramoSospechoso(segments) ? await detectVoiceOnset(wavPath) : null;
    const auto = voz ? { start: voz.start, end: voz.end } : speechBounds(segments, { voiceOnset });
    console.log(`[runner] recorte voz: whisper ${guia?.start.toFixed(2)}-${guia?.end.toFixed(2)} -> ${voz ? "audio" : "whisper"} ${auto?.start.toFixed(2)}-${auto?.end.toFixed(2)}`);

    // El recorte manual de la mesa de aprobacion tiene prioridad (si solo se dio un limite, el otro es automatico)
    const trim = (inicioManual !== null || finManual !== null)
      ? { start: inicioManual ?? auto?.start ?? 0, end: finManual ?? auto?.end }
      : auto;
    const textoWhisper = transcriptText(segments);
    const textoFinal = textoCorregido.trim() || textoWhisper;
    const wordTimed = wordTimedFromSegments(segments);
    const compact = textoCorregido.trim()
      ? alignCorrectedText(textoFinal, wordTimed, trim, 4)
      : chunkWordTimed(wordTimed, 4);
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
    let trimUsado = null;
    const recorteManual = { inicio: pieza.recorte_inicio, fin: pieza.recorte_fin };
    await downloadInput(rawKey, rawPath);

    if (tipo === 1) {
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "", recorteManual);
      await renderTipo1(rawPath, subs?.assPath, outPath, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
      trimUsado = subs?.trim ?? null;
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
      // Ventana de 6 s: si la pieza ya tiene recorte_inicio (es un fragmento, o un rehacer) se usa tal
      // cual; si no, es la primera vez y se decide cuantos fragmentos salen del original.
      let inicio = Number.isFinite(Number(pieza.recorte_inicio)) && pieza.recorte_inicio !== null ? Number(pieza.recorte_inicio) : null;
      if (inicio === null) {
        const inicios = planificarFragmentos(await getDuration(rawPath));
        inicio = inicios[0];
        if (inicios.length > 1) await dividirEnFragmentos(supabase, pieza, rawKey, inicios);
      }
      await renderTipo2(rawPath, outPath, { frase: pieza.frase_quemada ?? "", audioRefPath: audioRef, layout_json: pieza.layout_json ?? null, inicio });
      fraseQuemada = pieza.frase_quemada ?? "";
      trimUsado = { start: inicio, end: inicio + DURACION_TIPO2 };
    } else if (tipo === 3) {
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "", recorteManual);
      await renderTipo3(rawPath, subs?.assPath, outPath, 2, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
      trimUsado = subs?.trim ?? null;
    } else {
      const refKey = keyDesdeUrl(pieza.r2_key_referencia);
      if (!refKey) throw new Error("Tipo 4 sin video de referencia (r2_key_referencia)");
      const refPath = path.join(workDir, "referencia.mp4");
      await downloadFromR2(refKey, refPath);
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "", recorteManual);
      await renderTipo4(rawPath, refPath, outPath, subs?.assPath, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
      trimUsado = subs?.trim ?? null;
    }

    await uploadToR2(outPath, outKey);
    return { outKey, rawKey, fraseQuemada, trimUsado };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
