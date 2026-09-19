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
    const { stdout } = await execFileAsync("which", [bin]);
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
  ]);
  return wavPath;
}

/**
 * Detecta donde termina el silencio inicial del audio.
 * Esto complementa Whisper: Whisper puede adelantar el primer timestamp unos
 * frames, mientras que silencedetect encuentra el primer audio real.
 * @param {string} audioPath
 * @returns {Promise<number | null>}
 */
export async function detectAudioStart(audioPath) {
  try {
    const { stderr } = await execFileAsync(config.ffmpeg, [
      "-hide_banner",
      "-nostats",
      "-i", audioPath,
      "-af", "silencedetect=noise=-32dB:d=0.03",
      "-f", "null",
      "-",
    ], { maxBuffer: 1024 * 1024 * 4 });

    const startsAtZero = /silence_start:\s*0(?:\.0+)?\b/.test(stderr);
    if (!startsAtZero) return null;

    const match = stderr.match(/silence_end:\s*([0-9.]+)/);
    if (!match) return null;

    const start = Number(match[1]);
    return Number.isFinite(start) ? start : null;
  } catch {
    return null;
  }
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
    ]);
  } catch {
    await execFileAsync(whisper.bin, commonArgs);
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
 * Divide cada segmento de Whisper en subtitulos cortos.
 * Mantiene el tiempo del segmento original repartido de forma proporcional
 * para que no aparezca una frase larga entera en pantalla.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {number} maxWords
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function compactSubtitleSegments(segments, maxWords = 4) {
  const compact = [];
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
 * Limites de voz para recortar silencios de entrada/salida.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {object} opts
 * @param {number} [opts.padStart]
 * @param {number} [opts.padEnd]
 * @returns {{ start: number, end: number } | null}
 */
export function speechBounds(segments, { audioStart = null, padStart = 0, padEnd = 0.03 } = {}) {
  const spoken = segments.filter((seg) => seg.text.trim() && seg.end > seg.start);
  if (!spoken.length) return null;
  const firstWord = spoken[0].start;
  const audioStartIsClose = Number.isFinite(audioStart) && audioStart <= firstWord + 0.25;
  const start = audioStartIsClose ? Math.max(firstWord, audioStart) : firstWord;
  return {
    start: Math.max(0, start - padStart),
    end: spoken.at(-1).end + padEnd,
  };
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
Style: Default,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,80,80,560,1

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
