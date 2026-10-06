import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

const BIN_CANDIDATES = ["whisper-cpp", "whisper-cli", "whisper", "main"];
const MODEL_CANDIDATES = [
  "/opt/whisper/ggml-small.bin",
  "/opt/whisper/ggml-base.bin",
  "/opt/whisper/ggml-medium.bin",
  "/opt/whisper.cpp/models/ggml-small.bin",
  "/opt/whisper.cpp/models/ggml-base.bin",
];

async function enPath(bin) {
  try {
    const { stdout } = await execFileAsync("which", [bin], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Devuelve { bin, model } o null si whisper no esta instalado. */
export async function resolverWhisper() {
  let bin = config.whisperBin && existsSync(config.whisperBin) ? config.whisperBin : null;
  if (!bin && config.whisperBin) bin = await enPath(config.whisperBin);
  if (!bin) {
    for (const c of BIN_CANDIDATES) {
      bin = (await enPath(c)) ?? (existsSync(`/usr/local/bin/${c}`) ? `/usr/local/bin/${c}` : null);
      if (bin) break;
    }
  }
  const model = [config.whisperModel, ...MODEL_CANDIDATES].find((m) => m && existsSync(m)) ?? null;
  return bin && model ? { bin, model } : null;
}

/**
 * Extrae el audio de un vídeo con ffmpeg (WAV 16kHz mono para Whisper).
 * @param {string} videoPath - Ruta del vídeo
 * @param {string} outputDir - Directorio temporal
 * @returns {string} Ruta del archivo WAV
 */
export async function extractAudio(videoPath, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const wavPath = path.join(outputDir, "audio.wav");
  const ffmpeg = config.ffmpeg;
  await execFileAsync(ffmpeg, [
    "-y",
    "-i", videoPath,
    "-ar", "16000",
    "-ac", "1",
    "-f", "wav",
    wavPath,
  ], { timeout: config.commandTimeoutMs, maxBuffer: 1024 * 1024 * 8 });
  return wavPath;
}

/** Nivel medio (dB) de un tramo de audio. null si no se puede medir. */
async function medirVolumen(audioPath, start, duration) {
  try {
    const { stderr } = await execFileAsync(config.ffmpeg, [
      "-hide_banner", "-nostats",
      "-ss", String(Math.max(0, start)),
      "-i", audioPath,
      "-t", String(duration),
      "-af", "volumedetect",
      "-f", "null", "-",
    ], { maxBuffer: 1024 * 1024 * 2, timeout: 15000 });
    const match = stderr.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Busca el instante real en el que empieza a hablar, en vez de fiarse solo del
 * primer timestamp de Whisper ni de un silencedetect global. Dos problemas
 * distintos hacian esto poco fiable:
 *  - Con ruido de fondo constante (eco de habitacion, aire, rustle de ropa),
 *    silencedetect o bien disparaba casi al instante con el primer pico, o no
 *    detectaba silencio nunca si el ruido ya rozaba el umbral.
 *  - Whisper puede "alucinar" una palabra entera en el silencio/ruido inicial
 *    con un timestamp muy adelantado (segundos, no frames) cuando la voz real
 *    empieza mucho despues; escanear solo un poco mas alla de ese timestamp
 *    (como se hacia antes) se queda corto y nunca llega a la voz real.
 *
 * Por eso se ignora el timestamp de Whisper para esto: se mide el nivel de
 * ruido ambiente al principio del clip y se escanea un tramo fijo generoso
 * buscando una subida sostenida (no un pico suelto de respiracion) por
 * encima de ese suelo.
 * @param {string} audioPath
 * @param {{ maxScanSec?: number }} opts
 * @returns {Promise<number | null>}
 */
export async function detectVoiceOnset(audioPath, { maxScanSec = 6 } = {}) {
  const marginDb = 7;
  const sustainMarginDb = 5;
  const sustainSteps = 2;
  const stepSec = 0.06;
  const windowSec = 0.12;

  const floor = await medirVolumen(audioPath, 0, 0.25);
  if (floor === null) return null;

  const steps = Math.ceil(maxScanSec / stepSec);
  const vols = [];
  for (let i = 0; i <= steps; i++) {
    vols.push(await medirVolumen(audioPath, i * stepSec, windowSec));
  }

  for (let i = 0; i < vols.length; i++) {
    if (vols[i] === null || vols[i] < floor + marginDb) continue;
    let sostenido = true;
    for (let k = 1; k <= sustainSteps; k++) {
      const v = vols[i + k];
      if (v === null || v === undefined || v < floor + sustainMarginDb) { sostenido = false; break; }
    }
    if (sostenido) return i * stepSec;
  }
  return null;
}

/**
 * Decide si merece la pena corregir el timestamp inicial de Whisper con
 * detectVoiceOnset, o si es mejor no tocarlo.
 *
 * detectVoiceOnset se basa en volumen, no en si hay VOZ o solo ruido (viento,
 * eco, trafico...): en un video grabado con viento/ruido de fondo alto, la
 * voz real puede tardar en cruzar el margen por encima de ese ruido, y
 * "corregir" el inicio ahi cortaria habla real ya perfectamente valida (mismo
 * fallo que se queria arreglar, pero al reves).
 *
 * Por eso solo se llama a detectVoiceOnset cuando hay una señal concreta de
 * que el timestamp de Whisper NO es fiable: una de las primeras palabras
 * "reales" con una duracion absurda para lo corta que es (sintoma tipico de
 * una alucinacion o de varias palabras fusionadas en un silencio/ruido
 * inicial, como cuando Whisper inventa una frase corta a partir del silencio
 * de arranque). Si las primeras palabras tienen duraciones normales, se
 * confia en Whisper tal cual.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {{ maxWords?: number, umbralSeg?: number }} opts
 * @returns {boolean}
 */
export function primerTramoSospechoso(segments, { maxWords = 3, umbralSeg = 1.0 } = {}) {
  const spoken = segments.filter((s) => s.text.trim() && s.end > s.start);
  return spoken.slice(0, maxWords).some((s) => s.end - s.start > umbralSeg);
}

/**
 * Transcribe el audio con whisper-cpp y devuelve segmentos con tiempos.
 * Primero intenta forzar timestamps por palabra; si la version instalada no
 * soporta esas flags, cae al modo normal.
 * @param {string} wavPath - Ruta del archivo WAV
 * @param {string} outputDir - Directorio donde se generará el archivo SRT/VTT
 * @returns {{ start: number, end: number, text: string }[]} Segmentos de subtítulo
 */
export async function transcribeWithWhisper(wavPath, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const whisper = await resolverWhisper();
  if (!whisper) return [];

  const baseName = path.join(outputDir, "subs");
  const commonArgs = [
    "-m", whisper.model,
    "-f", wavPath,
    "-osrt",
    "-of", baseName,
    "-l", "es",
    "--word-thold", "0.01",
  ];

  try {
    await execFileAsync(whisper.bin, [
      ...commonArgs,
      "-ml", "1",
      "-sow",
    ], { timeout: config.commandTimeoutMs, maxBuffer: 1024 * 1024 * 8 });
  } catch {
    await execFileAsync(whisper.bin, commonArgs, { timeout: config.commandTimeoutMs, maxBuffer: 1024 * 1024 * 8 });
  }

  const srtPath = baseName + ".srt";
  if (!existsSync(srtPath)) {
    throw new Error(`Whisper no generó archivo SRT en ${srtPath}`);
  }

  const raw = await readFile(srtPath, "utf-8");
  return parseSRT(raw);
}

/**
 * Parsea un archivo SRT y devuelve segmentos.
 * @param {string} srtContent
 * @returns {{ start: number, end: number, text: string }[]}
 */
function parseSRT(srtContent) {
  const blocks = srtContent.trim().split(/\n\n+/);
  const segments = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!match) continue;
    const toSec = (h, m, s, ms) =>
      Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    const start = toSec(match[1], match[2], match[3], match[4]);
    const end = toSec(match[5], match[6], match[7], match[8]);
    const text = lines.slice(2).join(" ").trim();
    if (text) segments.push({ start, end, text });
  }
  return segments;
}

/**
 * Aplana los segmentos de Whisper a una lista de palabras con su tiempo real.
 * Cuando whisper-cpp soporta -sow/-ml 1 (caso normal en este servidor) cada
 * segmento YA es una sola palabra con su timestamp real; si el binario cae al
 * modo sin timestamps por palabra, se interpola proporcionalmente dentro del
 * segmento como aproximacion (mejor que nada, pero menos preciso).
 * @param {{ start: number, end: number, text: string }[]} segments
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function wordTimedFromSegments(segments) {
  const wordTimed = [];
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    if (words.length === 1) {
      wordTimed.push({ start: seg.start, end: seg.end, text: words[0] });
      continue;
    }

    const duration = Math.max(0.25, seg.end - seg.start);
    for (let i = 0; i < words.length; i++) {
      const start = seg.start + duration * (i / words.length);
      const end = seg.start + duration * ((i + 1) / words.length);
      wordTimed.push({ start, end, text: words[i] });
    }
  }
  return wordTimed;
}

/** Agrupa una lista de palabras con tiempo real en subtitulos de `maxWords` palabras. */
export function chunkWordTimed(wordTimed, maxWords = 4) {
  const compact = [];
  for (let i = 0; i < wordTimed.length; i += maxWords) {
    const chunk = wordTimed.slice(i, i + maxWords);
    compact.push({
      start: chunk[0].start,
      end: Math.max(chunk.at(-1).end, chunk[0].start + 0.25),
      text: chunk.map((word) => word.text).join(" "),
    });
  }
  return compact;
}

/**
 * Divide cada segmento de Whisper en subtitulos cortos, con el tiempo real de
 * cada palabra (ver wordTimedFromSegments).
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {number} maxWords
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function compactSubtitleSegments(segments, maxWords = 4) {
  return chunkWordTimed(wordTimedFromSegments(segments), maxWords);
}

/**
 * Limites de voz para recortar silencios de entrada/salida.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {object} opts
 * @param {number} [opts.padStart]
 * @param {number} [opts.padEnd]
 * @returns {{ start: number, end: number } | null}
 */
export function speechBounds(segments, { voiceOnset = null, padStart = 0, padEnd = 0.03 } = {}) {
  const spoken = segments.filter((seg) => seg.text.trim() && seg.end > seg.start);
  if (!spoken.length) return null;
  const firstWord = spoken[0].start;
  const start = Number.isFinite(voiceOnset) ? voiceOnset : firstWord;
  return {
    start: Math.max(0, start - padStart),
    end: spoken.at(-1).end + padEnd,
  };
}

export function transcriptText(segments) {
  return segments
    .map((seg) => seg.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function subtitleSegmentsFromText(text, bounds, maxWords = 4) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !bounds || !Number.isFinite(bounds.start) || !Number.isFinite(bounds.end)) return [];

  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords));

  const duration = Math.max(0.25, bounds.end - bounds.start);
  const chunkDuration = duration / chunks.length;
  return chunks.map((chunk, index) => {
    const start = bounds.start + chunkDuration * index;
    const end = index === chunks.length - 1 ? bounds.end : bounds.start + chunkDuration * (index + 1);
    return {
      start,
      end: Math.max(end, start + 0.25),
      text: chunk.join(" "),
    };
  });
}

/**
 * Subtitulos para un texto corregido a mano (ej. el admin arreglo una palabra
 * mal transcrita en la mesa de aprobacion), intentando conservar el tiempo
 * REAL de Whisper en vez de repartir el texto de forma uniforme (que es lo
 * que desincroniza el subtitulo del habla en cuanto se corrige/rehace algo).
 *
 * Si el texto corregido tiene el mismo numero de palabras que la transcripcion
 * original, se reutiliza el timestamp real de cada palabra (solo cambia el
 * texto). Si el admin reescribio la frase con otro numero de palabras, no hay
 * forma fiable de re-alinear palabra a palabra: se cae al reparto proporcional
 * uniforme sobre `bounds` (mismo comportamiento que antes).
 * @param {string} text - Texto corregido a quemar
 * @param {{ start: number, end: number, text: string }[]} wordTimed - Palabras con tiempo real (ver wordTimedFromSegments)
 * @param {{ start: number, end: number }} bounds - Limites de voz (fallback)
 * @param {number} maxWords
 */
export function alignCorrectedText(text, wordTimed, bounds, maxWords = 4) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  if (wordTimed.length === words.length) {
    const conTiempoReal = words.map((w, i) => ({ start: wordTimed[i].start, end: wordTimed[i].end, text: w }));
    return chunkWordTimed(conTiempoReal, maxWords);
  }

  // El texto corregido tiene otro numero de palabras que la transcripcion: cada palabra del texto toma el tiempo de la
  // palabra equivalente de la transcripcion (por posicion relativa, interpolando). Asi se conservan las pausas reales en
  // vez de repartir el texto a partes iguales.
  if (wordTimed.length >= 2) return chunkWordTimed(alinearTextoAPalabras(words, wordTimed), maxWords);

  return subtitleSegmentsFromText(text, bounds, maxWords);
}

/** Tiempos para `textos` a partir de otra lista de palabras con tiempo (distinto numero de palabras). */
export function alinearTextoAPalabras(textos, wordTimed) {
  const n = wordTimed.length;
  const m = textos.length;
  const inicios = textos.map((_, i) => {
    const p = Math.min(n - 1, Math.max(0, ((i + 0.5) * n) / m - 0.5));
    const a = Math.floor(p);
    const b = Math.min(n - 1, a + 1);
    return wordTimed[a].start + (wordTimed[b].start - wordTimed[a].start) * (p - a);
  });
  const fin = wordTimed[n - 1].end;
  return textos.map((text, i) => ({
    text,
    start: inicios[i],
    end: Math.max(inicios[i] + 0.12, Math.min(i + 1 < m ? inicios[i + 1] : fin, inicios[i] + 1.2)),
  }));
}

/**
 * Genera el contenido de un archivo ASS a partir de segmentos de subtítulo.
 * Estilo: blanco, negrita, centrado, borde negro, fuente grande.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {object} opts
 * @param {number} [opts.offset] - Segundos a restar tras recortar el vídeo.
 * @returns {string} Contenido del archivo ASS
 */
export function generateASS(segments, { offset = 0 } = {}) {
  const toAssTime = (sec) => {
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,80,80,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments
    .map((seg) => {
      const text = seg.text.replace(/\n/g, "\\N");
      return `Dialogue: 0,${toAssTime(seg.start - offset)},${toAssTime(seg.end - offset)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events + "\n";
}

/* ------------------------------------------------------------------------------------------------
 * Limites reales de la voz medidos en el audio (no en los timestamps de Whisper).
 * Whisper suele extender el primer y el ultimo tramo (p. ej. "No se." de 1,8 s con una sola palabra, o una
 * primera palabra en el segundo 0 cuando la voz entra en el 0,7), asi que el video no se recortaba justo
 * donde empieza y acaba de hablar. Aqui se mide el nivel (RMS) cada 20 ms y se buscan los tramos con voz;
 * Whisper solo sirve de guia de DONDE buscar.
 * ---------------------------------------------------------------------------------------------- */

const FRAME_SEC = 0.02;

/** Nivel RMS (dB) del audio cada 20 ms: [{ t, db }]. null si no se puede medir. */
export async function perfilDeNivel(audioPath) {
  try {
    const muestras = Math.round(16000 * FRAME_SEC); // el wav de extractAudio va a 16 kHz
    const { stdout } = await execFileAsync(config.ffmpeg, [
      "-hide_banner", "-nostats", "-loglevel", "error",
      "-i", audioPath,
      "-af", `asetnsamples=n=${muestras}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`,
      "-f", "null", "-",
    ], { maxBuffer: 1024 * 1024 * 48, timeout: config.commandTimeoutMs });
    const frames = [];
    let t = null;
    for (const linea of stdout.split("\n")) {
      const m = linea.match(/pts_time:([0-9.]+)/);
      if (m) {
        t = Number(m[1]);
        continue;
      }
      const v = linea.match(/RMS_level=(-?[0-9.]+|-inf|inf)/);
      if (v && t !== null) {
        frames.push({ t, db: v[1] === "-inf" ? -100 : Math.max(-100, Number(v[1])) });
        t = null;
      }
    }
    return frames.length > 20 ? frames : null;
  } catch {
    return null;
  }
}

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.max(0, Math.floor((p / 100) * orden.length)))];
};

/**
 * Donde empieza y donde acaba de verdad la voz.
 * @param {Array<{t:number, db:number}>} frames  perfil de nivel (perfilDeNivel)
 * @param {{ primeraPalabra:number, ultimaPalabraFin:number }} guia  tiempos de Whisper (solo como guia)
 * @returns {{ start:number, end:number } | null}  null si el audio no tiene contraste (ruido constante...)
 */
export function limitesDeVoz(frames, { primeraPalabra, ultimaPalabraFin }, { padInicio = 0.05, padFin = 0.12 } = {}) {
  if (!frames?.length) return null;
  const dbs = frames.map((f) => f.db);
  const suelo = percentil(dbs, 10);
  const pico = percentil(dbs, 95);
  if (pico - suelo < 10) return null; // sin contraste: no hay forma fiable de separar voz y ruido

  // Umbral = suelo de ruido + ~30 % del rango dinamico (y al menos 6 dB)
  const umbral = suelo + Math.max(6, 0.3 * (pico - suelo));

  // Tramos con voz; los huecos de menos de 0,25 s (pausas entre palabras) se unen y los tramos de menos de 0,15 s se ignoran
  const tramos = [];
  for (const f of frames) {
    if (f.db <= umbral) continue;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && f.t - ultimo.fin <= 0.25) ultimo.fin = f.t + FRAME_SEC;
    else tramos.push({ ini: f.t, fin: f.t + FRAME_SEC });
  }
  const utiles = tramos.filter((t) => t.fin - t.ini >= 0.15);
  if (!utiles.length) return null;

  // Inicio: el primer tramo con voz que no termina antes de la primera palabra de Whisper
  const inicio = utiles.find((t) => t.fin > primeraPalabra) ?? utiles[0];
  // Fin: el ultimo tramo que empieza antes del final de Whisper (+0,2 s); no pasa mas de 0,5 s del final de Whisper
  const candidatos = utiles.filter((t) => t.ini < ultimaPalabraFin + 0.2 && t.fin > inicio.ini);
  const final = candidatos[candidatos.length - 1] ?? inicio;

  const duracionTotal = frames[frames.length - 1].t + FRAME_SEC;
  const start = Math.max(0, inicio.ini - padInicio);
  const end = Math.min(duracionTotal, Math.min(final.fin, ultimaPalabraFin + 0.5) + padFin);
  if (end - start < 0.8) return null;
  return { start, end, umbral, suelo, pico, tramos: utiles };
}

/**
 * Coloca las palabras sobre la voz REAL. Whisper falla en los tiempos cuando el clip empieza con silencio: puede
 * creer que se habla desde el segundo 0 y repartir las palabras desde ahi (p. ej. voz real en el 3,7 s: los primeros
 * subtitulos acababan en tiempos negativos tras recortar y "desaparecian"). Aqui cada palabra recibe un tramo
 * proporcional a su longitud, repartido SOLO por los tramos con voz (las pausas no se rellenan).
 * @param {string[]} textos palabras en orden
 * @param {Array<{ini:number, fin:number}>} tramos tramos con voz, en tiempo del video original
 * @returns {Array<{start:number, end:number, text:string}>}
 */
export function repartirPalabrasEnVoz(textos, tramos) {
  const runs = tramos.filter((r) => r.fin - r.ini > 0.05);
  if (!textos.length || !runs.length) return [];
  const pesos = textos.map((t) => Math.max(2, t.replace(/[^\p{L}\p{N}]/gu, "").length));
  const W = pesos.reduce((a, b) => a + b, 0);
  const V = runs.reduce((a, r) => a + (r.fin - r.ini), 0);

  // tiempo "solo de voz" (0..V) -> tiempo real del video
  const aReal = (v, esFin) => {
    let acum = 0;
    for (const r of runs) {
      const largo = r.fin - r.ini;
      if (esFin ? v <= acum + largo + 1e-9 : v < acum + largo - 1e-9) return r.ini + Math.max(0, v - acum);
      acum += largo;
    }
    return runs[runs.length - 1].fin;
  };

  let cum = 0;
  return textos.map((text, i) => {
    const v0 = (cum / W) * V;
    cum += pesos[i];
    const v1 = (cum / W) * V;
    const start = aReal(v0, false);
    return { start, end: Math.max(start + 0.05, aReal(v1, true)), text };
  });
}

/**
 * Transcribe SOLO la parte del audio donde hay voz (con 0,1-0,3 s de margen) y devuelve los segmentos con tiempos del
 * audio original. Si Whisper ve el clip entero y empieza con silencio, coloca las primeras palabras en el segundo 0 y el
 * resto se va descuadrando; viendo solo la voz, los tiempos de cada palabra coinciden con lo que se oye.
 * @returns {Promise<Array<{start:number,end:number,text:string}>>} [] si falla (se usan los tiempos del audio completo)
 */
export async function transcribirZonaDeVoz(wavPath, outputDir, voz) {
  try {
    await mkdir(outputDir, { recursive: true });
    const ini = Math.max(0, voz.start - 0.1);
    const fin = voz.end + 0.3;
    const recortado = path.join(outputDir, "voz.wav");
    await execFileAsync(config.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(ini), "-to", String(fin), "-i", wavPath, "-ar", "16000", "-ac", "1", recortado], {
      timeout: config.commandTimeoutMs,
    });
    const segs = await transcribeWithWhisper(recortado, outputDir);
    return segs
      .filter((s) => s.text.trim() && s.end > s.start)
      .map((s) => ({ start: s.start + ini, end: s.end + ini, text: s.text }));
  } catch {
    return [];
  }
}
