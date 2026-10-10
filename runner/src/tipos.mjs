/**
 * Handlers por tipo de video. Devuelven { outKey, rawKey }; NO tocan la BD (lo hace index.mjs).
 *  tipo 1 = hablando (subtitulos Whisper)
 *  tipo 2 = caption/gesto (frase del banco quemada + audio de referencia opcional)
 *  tipo 3 = TikTok: SIN edicion (solo se pasa a mp4 y queda listo en la Mesa)
 *  tipo 4 = con referencia (antiguo, ya no se ofrece; se mantiene por si queda alguna pieza)
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
  repartirPalabrasEnVoz,
  transcribirZonaDeVoz,
  generateASS,
  primerTramoSospechoso,
  speechBounds,
  transcriptText,
  transcribeWithWhisper,
  wordTimedFromSegments,
} from "./whisper.mjs";
import { copiarSinEditar, getDuration, renderTipo1, renderTipo2, renderTipo4 } from "./ffmpeg.mjs";
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
    // Tiempos de cada palabra: Whisper sobre SOLO la zona con voz (si lo ve todo, un clip que empieza con silencio le descuadra
    // las palabras desde el principio y se va acumulando). Si eso falla, los del audio completo; y si ademas no cuadran con
    // la voz medida, las palabras se reparten por los tramos con voz (estimacion por longitud).
    const zona = voz ? await transcribirZonaDeVoz(wavPath, path.join(workDir, "audio_voz"), voz) : [];
    const textoWhisper = zona.length ? transcriptText(zona) : transcriptText(segments);
    const textoFinal = textoCorregido.trim() || textoWhisper;
    let wordTimed = wordTimedFromSegments(zona.length ? zona : segments);
    if (zona.length) {
      console.log(`[runner] subtitulos con Whisper sobre la zona con voz (${zona.length} palabras, ${zona[0].start.toFixed(2)}-${zona.at(-1).end.toFixed(2)})`);
    } else {
      const whisperCuadra = guia && voz && Math.abs(guia.start - voz.start) <= 0.4 && Math.abs(guia.end - voz.end) <= 0.6;
      if (voz && !whisperCuadra) {
        const dentro = voz.tramos
          .map((t) => ({ ini: Math.max(t.ini, trim?.start ?? 0), fin: Math.min(t.fin, trim?.end ?? Infinity) }))
          .filter((t) => t.fin > t.ini);
        const textos = textoFinal.trim().split(/\s+/).filter(Boolean);
        const reparto = repartirPalabrasEnVoz(textos, dentro);
        if (reparto.length === textos.length) {
          wordTimed = reparto;
          console.log(`[runner] subtitulos repartidos sobre la voz (whisper no cuadraba: ${guia.start.toFixed(2)}-${guia.end.toFixed(2)} vs voz ${voz.start.toFixed(2)}-${voz.end.toFixed(2)})`);
        }
      }
    }
    const compact = textoCorregido.trim()
      ? alignCorrectedText(textoFinal, wordTimed, trim, 4)
      : chunkWordTimed(wordTimed, 4);
    const assPath = path.join(workDir, "subs.ass");
    await writeFile(assPath, generateASS(compact, { offset: trim?.start ?? 0 }), "utf-8");
    return { assPath, trim, texto: textoFinal, manual: inicioManual !== null || finManual !== null };
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
    // recorte_inicio/fin guarda el recorte usado la ultima vez; solo es "manual" si lo marco una persona en la mesa
    // (marca [recorte-manual] en notas_editor). Si no, se recalcula por la voz en cada edicion.
    const esManual = /\[recorte-manual\]/.test(pieza.notas_editor ?? "");
    const recorteManual = esManual ? { inicio: pieza.recorte_inicio, fin: pieza.recorte_fin } : {};
    let trimManual = false;
    await downloadInput(rawKey, rawPath);

    if (tipo === 1) {
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "", recorteManual);
      await renderTipo1(rawPath, subs?.assPath, outPath, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
      trimUsado = subs?.trim ?? null;
      trimManual = Boolean(subs?.manual);
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
      // TikTok: sin subtitulos, sin recorte, sin frase. Llega a la Mesa tal cual la grabo la modelo.
      await copiarSinEditar(rawPath, outPath);
      fraseQuemada = "";
      trimUsado = null;
    } else {
      const refKey = keyDesdeUrl(pieza.r2_key_referencia);
      if (!refKey) throw new Error("Tipo 4 sin video de referencia (r2_key_referencia)");
      const refPath = path.join(workDir, "referencia.mp4");
      await downloadFromR2(refKey, refPath);
      const subs = await subtitulos(rawPath, workDir, pieza.frase_quemada ?? "", recorteManual);
      await renderTipo4(rawPath, refPath, outPath, subs?.assPath, { trim: subs?.trim });
      fraseQuemada = subs?.texto ?? pieza.frase_quemada ?? "";
      trimUsado = subs?.trim ?? null;
      trimManual = Boolean(subs?.manual);
    }

    await uploadToR2(outPath, outKey);
    return { outKey, rawKey, fraseQuemada, trimUsado, trimManual };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
