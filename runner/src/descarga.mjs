import { mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";

/** Descarga una URL a un archivo local (crea la carpeta si hace falta). */
export async function descargarUrl(url, destino, timeoutMs = 180000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok || !res.body) throw new Error(`Descarga ${res.status}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
}
