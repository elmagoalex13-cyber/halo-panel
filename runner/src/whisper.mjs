import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

const WHISPER_BIN = process.env.WHISPER_BIN ?? "whisper-cpp";
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "/opt/whisper/ggml-small.bin";

/**
 * Extrae el audio de un vídeo con ffmpeg (WAV 16kHz mono para Whisper).
 * @param {string} videoPath - Ruta del vídeo
 * @param {string} outputDir - Directorio temporal
 * @returns {string} Ruta del archivo WAV
 */
export async function extractAudio(videoPath, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const wavPath = path.join(outputDir, "audio.wav");
  const ffmpeg = process.env.FFMPEG_BIN ?? "ffmpeg";
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
 * Transcribe el audio con whisper-cpp y devuelve un array de segmentos SRT-like.
 * @param {string} wavPath - Ruta del archivo WAV
 * @param {string} outputDir - Directorio donde se generará el archivo SRT/VTT
 * @returns {{ start: number, end: number, text: string }[]} Segmentos de subtítulo
 */
export async function transcribeWithWhisper(wavPath, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const baseName = path.join(outputDir, "subs");
  await execFileAsync(WHISPER_BIN, [
    "-m", WHISPER_MODEL,
    "-f", wavPath,
    "-osrt",         // output SRT
    "-of", baseName, // output file prefix
    "-l", "es",      // language: Spanish
    "--word-thold", "0.01",
  ]);

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
 * Genera el contenido de un archivo ASS a partir de segmentos de subtítulo.
 * Estilo: blanco, negrita, centrado, borde negro, fuente grande.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @returns {string} Contenido del archivo ASS
 */
export function generateASS(segments) {
  const toAssTime = (sec) => {
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
Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,20,20,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments
    .map((seg) => {
      const text = seg.text.replace(/\n/g, "\\N");
      return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events + "\n";
}
