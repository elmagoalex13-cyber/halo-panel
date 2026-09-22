import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readdir, writeFile } from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

import { config } from "./config.mjs";

const FFMPEG = config.ffmpeg;
const FFPROBE = config.ffprobe;
export const ENCODE_VIDEO_ARGS = [
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "17",
  "-profile:v", "high",
  "-pix_fmt", "yuv420p",
  "-colorspace", "bt709",
  "-color_primaries", "bt709",
  "-color_trc", "bt709",
  "-color_range", "tv",
];
export const ENCODE_AUDIO_ARGS = ["-c:a", "aac", "-b:a", "192k"];

function hasTrim(trim) {
  return Number.isFinite(trim?.start) || Number.isFinite(trim?.end);
}

function buildVideoTrimFilter(trim = {}) {
  if (!hasTrim(trim)) return null;
  const parts = [];
  if (Number.isFinite(trim.start)) parts.push(`start=${Math.max(0, trim.start)}`);
  if (Number.isFinite(trim.end)) parts.push(`end=${Math.max(0.2, trim.end)}`);
  return `trim=${parts.join(":")},setpts=PTS-STARTPTS`;
}

function buildAudioTrimFilter(trim = {}) {
  if (!hasTrim(trim)) return null;
  const parts = [];
  if (Number.isFinite(trim.start)) parts.push(`start=${Math.max(0, trim.start)}`);
  if (Number.isFinite(trim.end)) parts.push(`end=${Math.max(0.2, trim.end)}`);
  return `atrim=${parts.join(":")},asetpts=PTS-STARTPTS`;
}

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

async function getVideoColorInfo(videoPath) {
  try {
    const { stdout } = await execFileAsync(FFPROBE, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      videoPath,
    ]);
    const info = JSON.parse(stdout);
    const stream = info.streams?.find((s) => s.codec_type === "video") ?? {};
    return {
      transfer: stream.color_transfer,
      primaries: stream.color_primaries,
      space: stream.color_space,
    };
  } catch {
    return {};
  }
}

async function needsHdrTonemap(videoPath) {
  const info = await getVideoColorInfo(videoPath);
  return (
    info.transfer === "smpte2084" ||
    info.transfer === "arib-std-b67" ||
    info.primaries === "bt2020" ||
    info.space === "bt2020nc"
  );
}

/**
 * Base de filtros comunes: reframe a 9:16 centrado, escalar a 1080×1920.
 * @param {object} opts
 * @param {boolean} [opts.zoom] - Si aplicar zoom suave (spoofer)
 * @param {number} [opts.zoomFactor] - Factor de zoom (default 1.03)
 */
function buildVideoFilter({ zoom = false, zoomFactor = 1.03, hdr = false } = {}) {
  const scale = zoom
    ? `scale=iw*${zoomFactor}:ih*${zoomFactor}:flags=lanczos,crop=1080:1920`
    : `scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920`;
  if (!hdr) return `${scale},format=yuv420p`;
  return [
    "zscale=t=linear:npl=100",
    "format=gbrpf32le",
    "zscale=p=bt709",
    "tonemap=tonemap=hable:desat=0",
    "zscale=t=bt709:m=bt709:r=tv",
    scale,
    "format=yuv420p",
  ].join(",");
}

function pushEncodeArgs(args, { shortest = false, faststart = true } = {}) {
  args.push(...ENCODE_VIDEO_ARGS, ...ENCODE_AUDIO_ARGS);
  if (faststart) args.push("-movflags", "+faststart");
  if (shortest) args.push("-shortest");
}

function wrapWords(text = "", maxChars = 24) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeAssText(value) {
  return String(value)
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function formatAssTime(seconds) {
  const sec = Math.max(0, seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function layoutTipo2Text(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const slashParts = clean.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 3) {
    const [first, ...rest] = slashParts;
    return [
      ...wrapWords(first, 26),
      ...rest.flatMap((part) => wrapWords(part, 28)),
    ].slice(0, 6).join("\n");
  }

  return wrapWords(clean, 27).slice(0, 5).join("\n");
}

async function writeTipo2Ass(filePath, text, { placement = "center", duration = 60 } = {}) {
  const alignment = placement === "top" ? 8 : 5;
  const marginV = placement === "top" ? 210 : 0;
  const body = layoutTipo2Text(text);
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Viral,Noto Sans,74,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4.5,0,${alignment},74,74,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${formatAssTime(duration)},Viral,,0,0,0,,${escapeAssText(body)}
`;
  await writeFile(filePath, ass, "utf-8");
}

async function detectFaceTextPlacement(inputPath, workDir, hdr = false) {
  const framesDir = path.join(workDir, "face-frames");
  await mkdir(framesDir, { recursive: true });

  try {
    const duration = await getDuration(inputPath);
    const fps = duration > 0 ? Math.min(0.5, 3 / duration) : 0.25;
    await execFileAsync(FFMPEG, [
      "-y",
      "-i", inputPath,
      "-vf", `${buildVideoFilter({ hdr })},fps=${fps}`,
      "-frames:v", "4",
      path.join(framesDir, "frame_%02d.jpg"),
    ], { maxBuffer: 1024 * 1024 * 4 });

    const frames = (await readdir(framesDir))
      .filter((file) => /\.(jpe?g|png)$/i.test(file))
      .map((file) => path.join(framesDir, file));
    if (!frames.length) return "center";

    const script = `
import json, sys
try:
    import cv2
except Exception:
    print(json.dumps({"placement": "center"}))
    sys.exit(0)

ys = []
for image_path in sys.argv[1:]:
    image = cv2.imread(image_path)
    if image is None:
        continue
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=(80, 80))
    if len(faces) == 0:
        continue
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    ys.append((y + h / 2) / image.shape[0])

if not ys:
    placement = "center"
else:
    avg = sum(ys) / len(ys)
    placement = "top" if avg > 0.54 else "center"
print(json.dumps({"placement": placement}))
`;

    const { stdout } = await execFileAsync("python3", ["-c", script, ...frames], { maxBuffer: 1024 * 1024 });
    const result = JSON.parse(stdout.trim() || "{}");
    return result.placement === "top" ? "top" : "center";
  } catch {
    return "center";
  }
}

/**
 * Tipo 1: hablando a cámara → subtítulos Whisper quemados.
 * @param {string} inputPath
 * @param {string} assPath - Ruta del archivo .ass generado
 * @param {string} outputPath
 * @param {object} [opts]
 * @param {{ start?: number, end?: number }} [opts.trim]
 */
export async function renderTipo1(inputPath, assPath, outputPath, { trim } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const hdr = await needsHdrTonemap(inputPath);
  const vf = [
    buildVideoTrimFilter(trim),
    buildVideoFilter({ hdr }),
    assPath ? `ass='${assPath.replace(/'/g, "\\'")}'` : null,
  ].filter(Boolean).join(",");
  const af = buildAudioTrimFilter(trim);

  const args = ["-y", "-i", inputPath];
  args.push(
    "-vf", vf,
  );
  if (af) args.push("-af", af);
  pushEncodeArgs(args);
  args.push(outputPath);

  await execFileAsync(FFMPEG, args);
}

/**
 * Tipo 2: caption/frase superpuesta + audio de referencia opcional.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} opts
 * @param {string} [opts.frase] - Texto a quemar en el vídeo
 * @param {string} [opts.audioRefPath] - Ruta del audio de referencia (si existe)
 */
export async function renderTipo2(inputPath, outputPath, { frase, audioRefPath } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const hdr = await needsHdrTonemap(inputPath);
  const placement = await detectFaceTextPlacement(inputPath, path.dirname(outputPath), hdr);
  const assPath = path.join(path.dirname(outputPath), "frase_tipo2.ass");

  const vfParts = [buildVideoFilter({ hdr })];
  if (frase?.trim()) {
    const duration = await getDuration(inputPath);
    await writeTipo2Ass(assPath, frase, { placement, duration: Math.max(1, duration) });
    vfParts.push(`subtitles='${escapeFilterValue(assPath)}':fontsdir='/usr/share/fonts'`);
  }

  const vf = vfParts.join(",");

  const args = ["-y", "-i", inputPath];
  if (audioRefPath) {
    args.push("-i", audioRefPath, "-map", "0:v", "-map", "1:a");
  }
  args.push("-vf", vf);
  pushEncodeArgs(args, { shortest: true });
  args.push(outputPath);

  await execFileAsync(FFMPEG, args);
}

/**
 * Tipo 3: reto → subtítulos Whisper + freeze frame final.
 * @param {string} inputPath
 * @param {string} assPath
 * @param {string} outputPath
 * @param {number} freezeDuration - Segundos de freeze al final (default 2)
 * @param {object} [opts]
 * @param {{ start?: number, end?: number }} [opts.trim]
 */
export async function renderTipo3(inputPath, assPath, outputPath, freezeDuration = 2, { trim } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const hdr = await needsHdrTonemap(inputPath);

  const mainPath = outputPath.replace(".mp4", "_main.mp4");
  const mainArgs = ["-y", "-i", inputPath];
  const trimVf = buildVideoTrimFilter(trim);
  const trimAf = buildAudioTrimFilter(trim);
  const mainVf = [trimVf, hdr ? buildVideoFilter({ hdr }) : null].filter(Boolean).join(",");
  if (mainVf) mainArgs.push("-vf", mainVf);
  if (trimAf) mainArgs.push("-af", trimAf);
  pushEncodeArgs(mainArgs, { faststart: false });
  mainArgs.push(mainPath);
  await execFileAsync(FFMPEG, mainArgs);

  const duration = await getDuration(mainPath);
  const freezeStart = Math.max(0, duration - 0.05);
  const tmpFreeze = outputPath.replace(".mp4", "_freeze.mp4");

  // 1. Congelar último frame
  await execFileAsync(FFMPEG, [
    "-y",
    "-i", mainPath,
    "-vf", `trim=start=${freezeStart},setpts=PTS-STARTPTS,` +
           `tpad=stop_mode=clone:stop_duration=${freezeDuration}`,
    "-af", `atrim=start=${freezeStart},asetpts=PTS-STARTPTS,` +
           `apad=pad_dur=${freezeDuration}`,
    ...ENCODE_VIDEO_ARGS,
    ...ENCODE_AUDIO_ARGS,
    tmpFreeze,
  ]);

  // 2. Concatenar original + freeze, reframe, quemar subtítulos
  const concatList = outputPath.replace(".mp4", "_concat.txt");
  await writeFile(concatList, `file '${mainPath}'\nfile '${tmpFreeze}'\n`);

  const vf = [buildVideoFilter(), assPath ? `ass='${assPath.replace(/'/g, "\\'")}'` : null].filter(Boolean).join(",");

  await execFileAsync(FFMPEG, [
    "-y",
    "-f", "concat", "-safe", "0",
    "-i", concatList,
    "-vf", vf,
    ...ENCODE_VIDEO_ARGS,
    ...ENCODE_AUDIO_ARGS,
    "-movflags", "+faststart",
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
 * @param {object} [opts]
 * @param {{ start?: number, end?: number }} [opts.trim]
 */
export async function renderTipo4(inputPath, refPath, outputPath, assPath = null, { trim } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const hdr = await needsHdrTonemap(inputPath);

  const refDuration = await getDuration(refPath);
  const maxDuration = Number.isFinite(trim?.end) && Number.isFinite(trim?.start)
    ? Math.min(refDuration, Math.max(0.2, trim.end - trim.start))
    : refDuration;
  const inputTrim = Number.isFinite(trim?.start)
    ? { start: trim.start, end: trim.start + maxDuration }
    : { start: 0, end: maxDuration };

  // Recortar el bruto a la duración de referencia y aplicar mismo tratamiento
  const vfParts = [buildVideoTrimFilter(inputTrim), buildVideoFilter({ hdr })].filter(Boolean);
  if (assPath) {
    vfParts.push(`ass='${assPath.replace(/'/g, "\\'")}'`);
  }
  const vf = vfParts.join(",");
  const af = buildAudioTrimFilter(inputTrim);

  const args = ["-y", "-i", inputPath];
  args.push(
    "-vf", vf,
  );
  if (af) args.push("-af", af);
  pushEncodeArgs(args);
  args.push(outputPath);

  await execFileAsync(FFMPEG, args);
}
