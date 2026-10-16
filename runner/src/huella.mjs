/**
 * «Huella visual» de un video: 6 fotogramas repartidos por el video, cada uno reducido a 9x8 en gris y convertido en 64 bits (dHash).
 * Dos videos que son el mismo con retoques pequeños (zoom del 4-9 %, brillo, color, filtro, recorte de unas decimas) dan huellas casi iguales;
 * videos distintos de la misma modelo y el mismo cuarto salen a 19+ bits de distancia (medido con reels reales).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);
const POSICIONES = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];
const W = 9;
const H = 8;
/** Por debajo de esta distancia (media de las 3 mejores parejas de fotogramas) se considera el mismo video. Copias propias: 5-9; distintos: 19+. */
export const UMBRAL_COPIA = 13;

async function duracion(archivo) {
  const { stdout } = await execFileAsync(config.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo]);
  return parseFloat(stdout) || 0;
}

export async function huellaVideo(archivo) {
  const d = await duracion(archivo);
  if (!d) throw new Error("no se pudo leer la duración del video");
  const huellas = [];
  for (const p of POSICIONES) {
    const { stdout } = await execFileAsync(
      config.ffmpeg,
      ["-v", "error", "-ss", String(d * p), "-i", archivo, "-frames:v", "1", "-vf", `scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-"],
      { encoding: "buffer", maxBuffer: 1024 * 1024 },
    );
    let bits = "";
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += stdout[y * W + x] > stdout[y * W + x + 1] ? "1" : "0";
    huellas.push(bits);
  }
  return huellas;
}

const hamming = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

/** Distancia entre dos huellas: media de las 3 parejas de fotogramas mas parecidas (robusta a un par de fotogramas distintos por el recorte). */
export function parecido(A, B) {
  if (!Array.isArray(A) || !Array.isArray(B) || A.length !== B.length) return 99;
  const d = A.map((a, i) => hamming(a, B[i])).sort((x, y) => x - y);
  return (d[0] + d[1] + d[2]) / 3;
}
