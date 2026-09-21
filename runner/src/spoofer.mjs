/**
 * Spoofer: convierte un video ya publicado (viral en la cuenta de la modelo) en una version
 * "nueva" para publicarla como trial reel. Cada pasada usa parametros aleatorios distintos:
 *   - recorta ~1 s del principio y ~1 s del final
 *   - amplia (zoom) un poco y recorta a 1080x1920
 *   - ajusta brillo, contraste y saturacion muy poco
 *   - aplica un filtro suave (balance de color + nitidez + grano fino)
 *   - borra los metadatos
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { ENCODE_AUDIO_ARGS, ENCODE_VIDEO_ARGS, getDuration } from "./ffmpeg.mjs";

const execFileAsync = promisify(execFile);

const rand = (min, max, dec = 3) => parseFloat((Math.random() * (max - min) + min).toFixed(dec));

/** Parametros aleatorios dentro de rangos que no se notan a simple vista. */
export function paramsSpoofer() {
  return {
    trimInicio: rand(0.9, 1.3, 2),
    trimFinal: rand(0.9, 1.3, 2),
    zoom: rand(1.03, 1.08),
    brillo: rand(-0.03, 0.03), // eq.brightness es aditivo
    contraste: rand(0.96, 1.06),
    saturacion: rand(0.94, 1.08),
    rojo: rand(-0.03, 0.03),
    verde: rand(-0.02, 0.02),
    azul: rand(-0.03, 0.03),
    grano: Math.round(rand(1, 4, 0)),
  };
}

/** Cadena de filtros ffmpeg para unos parametros dados. */
export function filtroSpoofer(p) {
  return [
    "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos",
    "crop=1080:1920",
    `scale=iw*${p.zoom}:ih*${p.zoom}`,
    "crop=1080:1920",
    `eq=brightness=${p.brillo}:contrast=${p.contraste}:saturation=${p.saturacion}`,
    `colorbalance=rs=${p.rojo}:gs=${p.verde}:bs=${p.azul}`,
    "unsharp=3:3:0.35",
    `noise=alls=${p.grano}:allf=t`,
    "format=yuv420p",
  ].join(",");
}

/** Genera la version spoofeada de `entrada` en `salida`. Devuelve los parametros usados. */
export async function spoofear(entrada, salida, params = paramsSpoofer()) {
  const dur = await getDuration(entrada);
  // videos muy cortos: se recorta proporcionalmente para no quedarse sin video
  const margen = Math.min(params.trimInicio, dur * 0.15);
  const margenFin = Math.min(params.trimFinal, dur * 0.15);
  const duracion = Math.max(1, dur - margen - margenFin);
  await mkdir(path.dirname(salida), { recursive: true });
  await execFileAsync(
    config.ffmpeg,
    [
      "-y",
      "-ss", String(margen),
      "-i", entrada,
      "-t", String(duracion.toFixed(3)),
      "-vf", filtroSpoofer(params),
      ...ENCODE_VIDEO_ARGS,
      ...ENCODE_AUDIO_ARGS,
      "-map_metadata", "-1",
      "-movflags", "+faststart",
      salida,
    ],
    { maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 },
  );
  return { ...params, duracion: Number(duracion.toFixed(2)) };
}
