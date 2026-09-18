import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

import { config } from "./config.mjs";

const FFMPEG = config.ffmpeg;
const FFPROBE = config.ffprobe;

/**
 * Obtiene la duración en segundos de un vídeo.
 * @param {string} videoPath
 * @returns {number}
 */
export async function getDuration(videoPath) {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_streams",
    videoPath,
  ]);
  const info = JSON.parse(stdout);
  const stream = info.streams?.find((s) => s.codec_type === "video");
  return parseFloat(stream?.duration ?? info.format?.duration ?? "0");
}

/**
 * Base de filtros comunes: reframe a 9:16 centrado, escalar a 1080×1920.
 * @param {object} opts
 * @param {boolean} [opts.zoom] - Si aplicar zoom suave (spoofer)
 * @param {number} [opts.zoomFactor] - Factor de zoom (default 1.03)
 */
function buildVideoFilter({ zoom = false, zoomFactor = 1.03 } = {}) {
  const scale = zoom
    ? `scale=iw*${zoomFactor}:ih*${zoomFactor},crop=1080:1920`
    : `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`;
  return scale;
}

/**
 * Tipo 1: hablando a cámara → subtítulos Whisper quemados.
 * @param {string} inputPath
 * @param {string} assPath - Ruta del archivo .ass generado
 * @param {string} outputPath
 */
export async function renderTipo1(inputPath, assPath, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const vf = [buildVideoFilter(), assPath ? `ass='${assPath.replace(/'/g, "\\'")}'` : null].filter(Boolean).join(",");

  await execFileAsync(FFMPEG, [
    "-y",
    "-i", inputPath,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
}

/**
 * Tipo 2: caption/frase superpuesta (drawtext) + audio de referencia opcional.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} opts
 * @param {string} [opts.frase] - Texto a quemar en el vídeo
 * @param {string} [opts.audioRefPath] - Ruta del audio de referencia (si existe)
 */
export async function renderTipo2(inputPath, outputPath, { frase, audioRefPath } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const textFilter = frase
    ? `,drawtext=text='${frase.replace(/'/g, "\\'").replace(/:/g, "\\:")}':` +
      `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
      `fontsize=72:fontcolor=white:borderw=4:bordercolor=black:` +
      `x=(w-text_w)/2:y=h-text_h-120:` +
      `enable='between(t,0,duration)'`
    : "";

  const vf = buildVideoFilter() + textFilter;

  const args = ["-y", "-i", inputPath];
  if (audioRefPath) {
    args.push("-i", audioRefPath, "-map", "0:v", "-map", "1:a");
  }
  args.push(
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-shortest",
    outputPath
  );

  await execFileAsync(FFMPEG, args);
}

/**
 * Tipo 3: reto → subtítulos Whisper + freeze frame final.
 * @param {string} inputPath
 * @param {string} assPath
 * @param {string} outputPath
 * @param {number} freezeDuration - Segundos de freeze al final (default 2)
 */
export async function renderTipo3(inputPath, assPath, outputPath, freezeDuration = 2) {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const duration = await getDuration(inputPath);
  const freezeStart = Math.max(0, duration - 0.05);
  const tmpFreeze = outputPath.replace(".mp4", "_freeze.mp4");

  // 1. Congelar último frame
  await execFileAsync(FFMPEG, [
    "-y",
    "-i", inputPath,
    "-vf", `trim=start=${freezeStart},setpts=PTS-STARTPTS,` +
           `tpad=stop_mode=clone:stop_duration=${freezeDuration}`,
    "-af", `atrim=start=${freezeStart},asetpts=PTS-STARTPTS,` +
           `apad=pad_dur=${freezeDuration}`,
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    tmpFreeze,
  ]);

  // 2. Concatenar original + freeze, reframe, quemar subtítulos
  const concatList = outputPath.replace(".mp4", "_concat.txt");
  await writeFile(concatList, `file '${inputPath}'\nfile '${tmpFreeze}'\n`);

  const vf = [buildVideoFilter(), assPath ? `ass='${assPath.replace(/'/g, "\\'")}'` : null].filter(Boolean).join(",");

  await execFileAsync(FFMPEG, [
    "-y",
    "-f", "concat", "-safe", "0",
    "-i", concatList,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
}

/**
 * Tipo 4: copia exacta de estructura del vídeo de referencia.
 * Aplica los mismos filtros de color/crop que el referencia, detectados por ffprobe.
 * En la práctica: reframe + subtítulos si los hay + mismo aspect ratio.
 * @param {string} inputPath - Vídeo bruto original
 * @param {string} refPath - Vídeo de referencia ya editado
 * @param {string} outputPath
 * @param {string|null} assPath - Subtítulos si aplica
 */
export async function renderTipo4(inputPath, refPath, outputPath, assPath = null) {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const refDuration = await getDuration(refPath);

  // Recortar el bruto a la duración de referencia y aplicar mismo tratamiento
  const vfParts = [buildVideoFilter()];
  if (assPath) {
    vfParts.push(`ass='${assPath.replace(/'/g, "\\'")}'`);
  }
  const vf = vfParts.join(",");

  await execFileAsync(FFMPEG, [
    "-y",
    "-i", inputPath,
    "-t", String(refDuration),
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
}
