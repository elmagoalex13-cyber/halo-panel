import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, readdir, rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

export function visionDisponible() {
  return Boolean(config.openaiKey);
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
