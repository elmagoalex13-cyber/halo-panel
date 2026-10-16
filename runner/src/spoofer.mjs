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

/* ------------------------------------------------------------------------------------------------------------------------------------------
 * Trial reels del panel (seccion «Trial reels»): de UN video viral salen 3 versiones distintas entre si y distintas del original.
 * Pequeños retoques que no se notan: zoom por la izquierda, por la derecha o centrado, brillo, contraste, saturacion, tono, blancos y negros,
 * un filtro muy suave distinto en cada version, y sin metadatos (ni los de ffmpeg ni los del codec).
 * ---------------------------------------------------------------------------------------------------------------------------------------- */
export const VARIANTES_TRIAL = 3;
const ANCLAS = ["izquierda", "derecha", "centro"]; // de que lado se amplia: cada version usa uno distinto

/** Parametros de la version n (1..3): al azar dentro de rangos que no se notan, con el zoom anclado a un lado distinto en cada una. */
export function paramsTrial(n) {
  const ancla = ANCLAS[(n - 1) % ANCLAS.length];
  return {
    ancla,
    zoom: rand(1.04, 1.09),
    alturaY: rand(0.4, 0.6, 2), // donde se recorta en vertical (0.5 = centrado)
    brillo: rand(-0.03, 0.03),
    contraste: rand(0.97, 1.05),
    saturacion: rand(0.95, 1.07),
    gamma: rand(0.97, 1.03),
    tono: rand(-3, 3, 1), // grados
    negros: rand(0.004, 0.022), // sube un pelin los negros
    blancos: rand(0.978, 0.996), // baja un pelin los blancos
    rojo: rand(-0.025, 0.025),
    verde: rand(-0.015, 0.015),
    azul: rand(-0.025, 0.025),
    nitidez: rand(0.18, 0.4, 2),
    grano: n === 3 ? Math.round(rand(2, 3, 0)) : Math.round(rand(0, 1, 0)),
    vineta: n === 2, // la version 2 lleva una vineta casi imperceptible
    trimInicio: rand(0.04, 0.2, 2),
    trimFinal: rand(0.04, 0.2, 2),
    crf: rand(17, 19.5, 1),
    gop: Math.round(rand(48, 90, 0)),
    audio: rand(-0.4, 0.4, 2), // dB
  };
}

/** Lo que cambia, en palabras (para enseñarlo en el panel). */
export function resumenTrial(p) {
  const pc = (v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
  return [
    `zoom ${p.ancla} ×${p.zoom}`,
    `brillo ${pc(p.brillo)}`,
    `contraste ${pc(p.contraste - 1)}`,
    `saturación ${pc(p.saturacion - 1)}`,
    `tono ${p.tono > 0 ? "+" : ""}${p.tono}°`,
    p.vineta ? "viñeta suave" : p.grano >= 2 ? "grano fino" : "nitidez",
  ];
}

export function filtroTrial(p) {
  const x = p.ancla === "izquierda" ? "0" : p.ancla === "derecha" ? "iw-1080" : "(iw-1080)/2";
  return [
    "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos",
    "crop=1080:1920",
    `scale=trunc(iw*${p.zoom}/2)*2:trunc(ih*${p.zoom}/2)*2:flags=lanczos`,
    `crop=1080:1920:${x}:(ih-1920)*${p.alturaY}`,
    `eq=brightness=${p.brillo}:contrast=${p.contraste}:saturation=${p.saturacion}:gamma=${p.gamma}`,
    `hue=h=${p.tono}`,
    `curves=all='0/${p.negros} 1/${p.blancos}'`,
    `colorbalance=rs=${p.rojo}:gs=${p.verde}:bs=${p.azul}`,
    `unsharp=3:3:${p.nitidez}`,
    ...(p.grano > 0 ? [`noise=alls=${p.grano}:allf=t`] : []),
    ...(p.vineta ? ["vignette=angle=PI/6"] : []),
    "format=yuv420p",
  ].join(",");
}

/** Genera una version trial de `entrada` en `salida`. Devuelve la duracion final. */
export async function spoofearTrial(entrada, salida, p) {
  const dur = await getDuration(entrada);
  const ini = Math.min(p.trimInicio, dur * 0.1);
  const fin = Math.min(p.trimFinal, dur * 0.1);
  const duracion = Math.max(1, dur - ini - fin);
  await mkdir(path.dirname(salida), { recursive: true });
  await execFileAsync(
    config.ffmpeg,
    [
      "-y",
      "-ss", String(ini),
      "-i", entrada,
      "-t", duracion.toFixed(3),
      "-vf", filtroTrial(p),
      "-af", `volume=${p.audio}dB`,
      ...ENCODE_VIDEO_ARGS.map((a, i, arr) => (arr[i - 1] === "-crf" ? String(p.crf) : a)),
      "-g", String(p.gop),
      "-bsf:v", "filter_units=remove_types=6", // quita el SEI de x264 (la «huella» del codificador con sus opciones)
      ...ENCODE_AUDIO_ARGS,
      "-map_metadata", "-1",
      "-map_chapters", "-1",
      "-fflags", "+bitexact",
      "-flags:v", "+bitexact",
      "-flags:a", "+bitexact",
      "-movflags", "+faststart",
      salida,
    ],
    { maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 },
  );
  return { duracion: Number(duracion.toFixed(2)) };
}
