import { execFile } from "child_process";
import { promisify } from "util";
import { copyFile, mkdir, writeFile } from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

import { config } from "./config.mjs";
import { DURACION_TIPO2 } from "./fragmentos.mjs";

const FFMPEG = config.ffmpeg;
const FFPROBE = config.ffprobe;
export const ENCODE_VIDEO_ARGS = [
  "-c:v", "libx264",
  "-preset", config.ffmpegPreset,
  "-crf", config.ffmpegCrf,
  "-threads", String(config.ffmpegThreads),
  "-profile:v", "high",
  "-pix_fmt", "yuv420p",
  "-colorspace", "bt709",
  "-color_primaries", "bt709",
  "-color_trc", "bt709",
  "-color_range", "tv",
];
export const ENCODE_AUDIO_ARGS = ["-c:a", "aac", "-b:a", "192k"];

function tail(value = "", max = 1400) {
  const clean = String(value).trim();
  return clean.length > max ? clean.slice(-max) : clean;
}

async function runFfmpeg(args, opts = {}) {
  try {
    return await execFileAsync(FFMPEG, args, { maxBuffer: 1024 * 1024 * 12, timeout: config.commandTimeoutMs, ...opts });
  } catch (err) {
    const stderr = tail(err.stderr || err.stdout || "");
    const command = `${FFMPEG} ${args.join(" ")}`;
    const message = stderr || err.message || "ffmpeg fallo sin stderr";
    throw new Error(`ffmpeg fallo: ${message}\nComando: ${command}`);
  }
}

async function runWithHdrFallback(buildArgs, { hdr, label }) {
  try {
    await runFfmpeg(buildArgs(hdr));
  } catch (err) {
    if (!hdr) throw err;
    console.warn(`[runner] ${label}: fallo HDR/tonemap, reintento SDR: ${tail(err.message, 500)}`);
    await runFfmpeg(buildArgs(false));
  }
}

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

// libass (el motor que quema estos subtitulos) no sabe pintar emoji a color: como mucho dibuja
// un contorno monocromo (facil de confundir con el propio texto blanco) y las banderas
// (secuencias de dos "regional indicator") salen directamente como cuadros con las letras dentro.
// Mejor quitarlos limpiamente que dejar un icono roto o invisible.
const EMOJI_RE =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

function quitarEmoji(texto = "") {
  return String(texto)
    .replace(EMOJI_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?:;])/g, "$1")
    .split("\n")
    .map((linea) => linea.trim())
    .join("\n")
    .trim();
}

// Tamano de letra seguro: por debajo de esto no se lee bien en un movil, por encima queda
// desproporcionado para una frase corta (habia layouts con hasta 156px para 3 palabras).
function limitarFontsize(valor, porDefecto = 56) {
  const n = Math.round(Number(valor) || porDefecto);
  return Math.min(88, Math.max(36, n));
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
  const clean = quitarEmoji(String(text)).replace(/\s+/g, " ").trim();
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


function hexToAssColor(hex = "#FFFFFF") {
  const h = String(hex).replace("#", "").padEnd(6, "0");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** Color para un override inline (\c&HBBGGRR&), sin el byte de alfa que llevan los Style. */
function hexToAssInlineColor(hex = "#FFFFFF") {
  const h = String(hex).replace("#", "").padEnd(6, "0");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

// El texto de tipo 2 va SIEMPRE centrado en pantalla (horizontal y vertical), empujado un
// poquito hacia abajo del centro exacto. Antes la posicion (arriba/abajo/izq/der) salia del
// layout_json (que analiza OTRO video, el de referencia) o de detectar la cara con OpenCV; las
// dos formas fallaban a menudo (posicion de otro video no aplica al real, deteccion de cara
// poco fiable en primeros planos/angulos raros) y el texto acababa tapando la cara o pegado a
// un borde. Un centro fijo, ligeramente bajo, es la posicion mas segura para cualquier encuadre.
const CENTRO_X = 540; // PlayResX=1080 / 2
const CENTRO_Y = 1060; // PlayResY=1920 / 2 = 960, +100px hacia abajo

/**
 * Genera un fichero ASS con todos los bloques de texto fundidos en un unico evento, siempre
 * centrado (ver CENTRO_X/CENTRO_Y). Se ignora la "posicion" que pueda traer cada bloque; solo
 * se respeta su tamano/color/negrita propios, y el orden en el que aparecen (arriba del todo el
 * primero, como una sola frase de varias lineas).
 */
async function writeTipo2AssMulti(filePath, bloques, { duration = 60 } = {}) {
  const primero = bloques[0];
  const color = hexToAssColor(primero?.color ?? "#FFFFFF");
  const bold = primero?.negrita ? -1 : 0;
  const fontsize = limitarFontsize(primero?.fontsize);

  const texto = bloques
    .map((b) => {
      const fs = limitarFontsize(b.fontsize, fontsize);
      const inlineColor = hexToAssInlineColor(b.color ?? "#FFFFFF");
      const inlineBold = b.negrita ? 1 : 0;
      const limpio = quitarEmoji(b.texto ?? "");
      return `{\\fs${fs}\\c${inlineColor}\\b${inlineBold}}${escapeAssText(limpio.replace(/\n/g, "\\N"))}`;
    })
    .join("\\N");

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Bloque,Noto Sans,${fontsize},${color},&H000000FF,&H00000000,&H80000000,${bold},0,0,0,100,100,0,0,1,4,0,5,80,80,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${formatAssTime(duration)},Bloque,,0,0,0,,{\\an5\\pos(${CENTRO_X},${CENTRO_Y})}${texto}
`;
  await writeFile(filePath, ass, "utf-8");
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
  const buildArgs = (useHdr) => {
    const vf = [
      buildVideoTrimFilter(trim),
      buildVideoFilter({ hdr: useHdr }),
      assPath ? `ass='${assPath.replace(/'/g, "\\'")}'` : null,
    ].filter(Boolean).join(",");
    const af = buildAudioTrimFilter(trim);
    const args = ["-y", "-i", inputPath, "-vf", vf];
    if (af) args.push("-af", af);
    pushEncodeArgs(args);
    args.push(outputPath);
    return args;
  };

  await runWithHdrFallback(buildArgs, { hdr, label: "tipo1" });
}

/**
 * Tipo 3 (TikTok): SIN edicion. Solo se pasa a mp4 copiando las pistas tal cual (sin recomprimir, sin recortar, sin subtitulos).
 * Si el contenedor no admite la copia directa, se copia el archivo como esta.
 */
export async function copiarSinEditar(inputPath, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await runFfmpeg(["-y", "-i", inputPath, "-map", "0", "-c", "copy", "-movflags", "+faststart", outputPath]);
  } catch {
    await copyFile(inputPath, outputPath);
  }
}

/**
 * Tipo 2: caption/frase superpuesta + audio de referencia opcional.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} opts
 * @param {string} [opts.frase] - Texto a quemar en el vídeo
 * @param {string} [opts.audioRefPath] - Ruta del audio de referencia (si existe)
 * @param {{ bloques?: Array<{ texto?: string; posicion?: string; color?: string; negrita?: boolean; fontsize?: number }> }} [opts.layout_json]
 */
export async function renderTipo2(inputPath, outputPath, { frase, audioRefPath, layout_json, inicio = 0 } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const hdr = await needsHdrTonemap(inputPath);
  const assPath = path.join(path.dirname(outputPath), "frase_tipo2.ass");

  const hasLayoutJson = Array.isArray(layout_json?.bloques) && layout_json.bloques.length > 0;
  const overlayFilters = [];

  if (hasLayoutJson || frase?.trim()) {
    // Siempre centrado (ver writeTipo2AssMulti): si hay layout_json se usan sus bloques
    // (tamano/color propios), si no, la frase suelta como un unico bloque.
    const bloques = hasLayoutJson
      ? layout_json.bloques
      : [{ texto: layoutTipo2Text(frase), fontsize: 56, color: "#FFFFFF", negrita: true }];
    await writeTipo2AssMulti(assPath, bloques, { duration: DURACION_TIPO2 });
    overlayFilters.push(`subtitles='${escapeFilterValue(assPath)}':fontsdir='/usr/share/fonts'`);
  }

  // Siempre exactamente DURACION_TIPO2 s: se corta la ventana que empieza en `inicio`, y si el
  // original es mas corto se repite en bucle hasta completarla.
  const duracionEntrada = await getDuration(inputPath);
  const enBucle = duracionEntrada < DURACION_TIPO2 - 0.05;

  const buildArgs = (useHdr) => {
    const vf = [buildVideoFilter({ hdr: useHdr }), ...overlayFilters].join(",");
    const args = ["-y"];
    if (enBucle) args.push("-stream_loop", "-1");
    else if (inicio > 0) args.push("-ss", String(inicio));
    args.push("-i", inputPath);
    if (audioRefPath) {
      args.push("-i", audioRefPath, "-map", "0:v", "-map", "1:a", "-af", "apad");
    }
    args.push("-vf", vf);
    pushEncodeArgs(args);
    args.push("-t", String(DURACION_TIPO2), outputPath);
    return args;
  };

  await runWithHdrFallback(buildArgs, { hdr, label: "tipo2" });
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
  const trimVf = buildVideoTrimFilter(trim);
  const trimAf = buildAudioTrimFilter(trim);
  const buildMainArgs = (useHdr) => {
    const mainArgs = ["-y", "-i", inputPath];
    const mainVf = [trimVf, buildVideoFilter({ hdr: useHdr })].filter(Boolean).join(",");
    if (mainVf) mainArgs.push("-vf", mainVf);
    if (trimAf) mainArgs.push("-af", trimAf);
    pushEncodeArgs(mainArgs, { faststart: false });
    mainArgs.push(mainPath);
    return mainArgs;
  };
  await runWithHdrFallback(buildMainArgs, { hdr, label: "tipo3-main" });

  const duration = await getDuration(mainPath);
  const freezeStart = Math.max(0, duration - 0.05);
  const tmpFreeze = outputPath.replace(".mp4", "_freeze.mp4");

  // 1. Congelar último frame
  await runFfmpeg([
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

  await runFfmpeg([
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

  const buildArgs = (useHdr) => {
    // Recortar el bruto a la duración de referencia y aplicar mismo tratamiento
    const vfParts = [buildVideoTrimFilter(inputTrim), buildVideoFilter({ hdr: useHdr })].filter(Boolean);
    if (assPath) {
      vfParts.push(`ass='${assPath.replace(/'/g, "\\'")}'`);
    }
    const vf = vfParts.join(",");
    const af = buildAudioTrimFilter(inputTrim);
    const args = ["-y", "-i", inputPath, "-vf", vf];
    if (af) args.push("-af", af);
    pushEncodeArgs(args);
    args.push(outputPath);
    return args;
  };

  await runWithHdrFallback(buildArgs, { hdr, label: "tipo4" });
}
