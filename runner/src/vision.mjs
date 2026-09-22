import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, readdir, rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

export function visionDisponible() {
  return Boolean(config.openaiKey);
}

export async function analizarLayoutTexto(videoPath) {
  const framesDir = path.join(path.dirname(videoPath), "layout-frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  try {
    const frames = await extraerFramesLayout(videoPath, framesDir);
    for (const frame of frames) {
      const bloques = await leerBloquesConTesseract(frame);
      if (bloques.length) return { version: 1, origen: "tesseract", bloques };
    }
    return null;
  } catch (err) {
    console.warn(`[vision] no se pudo extraer layout OCR de ${path.basename(videoPath)}: ${err.message}`);
    return null;
  } finally {
    await rm(framesDir, { recursive: true, force: true });
  }
}

export async function analizarFraseMusicaVisual(videoPath, contexto = {}) {
  if (!visionDisponible()) return null;

  const framesDir = path.join(path.dirname(videoPath), "vision-frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  try {
    const frames = await extraerFrames(videoPath, framesDir);
    if (!frames.length) return null;

    const imagenes = await Promise.all(frames.map(async (frame) => `data:image/jpeg;base64,${(await readFile(frame)).toString("base64")}`));
    return await preguntarVision(imagenes, contexto);
  } catch (err) {
    console.warn(`[vision] no se pudo analizar ${path.basename(videoPath)}: ${err.message}`);
    return null;
  } finally {
    await rm(framesDir, { recursive: true, force: true });
  }
}

async function extraerFramesLayout(videoPath, outputDir) {
  const pattern = path.join(outputDir, "layout-%02d.png");
  await execFileAsync(config.ffmpeg, [
    "-y",
    "-i", videoPath,
    "-vf", "fps=1/2,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-frames:v", "4",
    pattern,
  ], { maxBuffer: 1024 * 1024 * 8 });

  const files = await readdir(outputDir);
  return files
    .filter((file) => /^layout-\d+\.png$/.test(file))
    .sort()
    .map((file) => path.join(outputDir, file));
}

async function leerBloquesConTesseract(imagePath) {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("tesseract", [
      imagePath,
      "stdout",
      "--psm", "6",
      "-l", "spa+eng",
      "tsv",
    ], { maxBuffer: 1024 * 1024 * 4 }));
  } catch {
    return [];
  }

  const rows = stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 12)
    .map((cols) => ({
      level: Number(cols[0]),
      block: cols[2],
      par: cols[3],
      line: cols[4],
      left: Number(cols[6]),
      top: Number(cols[7]),
      width: Number(cols[8]),
      height: Number(cols[9]),
      conf: Number(cols[10]),
      text: cols.slice(11).join("\t").trim(),
    }))
    .filter((row) => row.level === 5 && row.conf >= 35 && row.text);

  const lineas = new Map();
  for (const row of rows) {
    const key = `${row.block}:${row.par}:${row.line}`;
    const actual = lineas.get(key) ?? { words: [], left: row.left, top: row.top, right: row.left + row.width, bottom: row.top + row.height };
    actual.words.push(row.text);
    actual.left = Math.min(actual.left, row.left);
    actual.top = Math.min(actual.top, row.top);
    actual.right = Math.max(actual.right, row.left + row.width);
    actual.bottom = Math.max(actual.bottom, row.top + row.height);
    lineas.set(key, actual);
  }

  const bloques = Array.from(lineas.values())
    .map((linea) => ({
      texto: linea.words.join(" ").replace(/\s+/g, " ").trim(),
      posicion: posicionDesdeCaja(linea),
      color: "#FFFFFF",
      negrita: true,
      fontsize: 72,
    }))
    .filter((bloque) => bloque.texto.length >= 3);

  return unirBloquesCercanos(bloques).slice(0, 5);
}

function posicionDesdeCaja({ left, top, right, bottom }) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const x = cx < 360 ? "left" : cx > 720 ? "right" : "center";
  if (cy < 640) return `top-${x}`;
  if (cy > 1280) return `bottom-${x}`;
  return x === "center" ? "center" : `mid-${x}`;
}

function unirBloquesCercanos(bloques) {
  if (bloques.length <= 1) return bloques;
  const grupos = [];
  for (const bloque of bloques) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.posicion === bloque.posicion && ultimo.texto.length + bloque.texto.length < 180) {
      ultimo.texto = `${ultimo.texto}\n${bloque.texto}`;
    } else {
      grupos.push({ ...bloque });
    }
  }
  return grupos;
}

async function extraerFrames(videoPath, outputDir) {
  const pattern = path.join(outputDir, "frame-%02d.jpg");
  await execFileAsync(config.ffmpeg, [
    "-y",
    "-i", videoPath,
    "-vf", "fps=1/2,scale=360:-1",
    "-frames:v", "5",
    "-q:v", "4",
    pattern,
  ], { maxBuffer: 1024 * 1024 * 8 });

  const files = await readdir(outputDir);
  return files
    .filter((file) => /^frame-\d+\.jpg$/.test(file))
    .sort()
    .slice(0, 5)
    .map((file) => path.join(outputDir, file));
}

async function preguntarVision(imageUrls, contexto) {
  const prompt = [
    "Analiza estos frames de un reel de Instagram.",
    "Queremos SOLO videos del estilo: una persona haciendo un gesto, pose o escena corta, con una frase viral visible escrita en pantalla y música/canción de fondo.",
    "No queremos videos hablando a cámara, entrevistas, tutoriales, vídeos sin texto visible, memes sin persona, ni vídeos donde el texto principal sea un caption largo.",
    "Devuelve JSON estricto con:",
    "- es_frase_musica: boolean",
    "- confianza: número 0..1",
    "- frase_visible: texto exacto visible si se lee, o null",
    "- motivo: explicación corta",
    "- tipo_visual: una de: gesto_frase, hablado, referencia_visual, otro",
    `Caption/descripcion de Instagram: ${contexto.descripcion ?? ""}`,
    `Canción detectada por Instagram: ${[contexto.cancion, contexto.artista].filter(Boolean).join(" - ") || "desconocida"}`,
  ].join("\n");

  const body = {
    model: config.openaiVisionModel,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...imageUrls.map((image_url) => ({ type: "input_image", image_url })),
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "clasificacion_frase_musica",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            es_frase_musica: { type: "boolean" },
            confianza: { type: "number" },
            frase_visible: { anyOf: [{ type: "string" }, { type: "null" }] },
            motivo: { type: "string" },
            tipo_visual: { type: "string", enum: ["gesto_frase", "hablado", "referencia_visual", "otro"] },
          },
          required: ["es_frase_musica", "confianza", "frase_visible", "motivo", "tipo_visual"],
        },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`OpenAI vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
  if (!text) throw new Error("OpenAI vision no devolvio texto");
  return JSON.parse(text);
}
