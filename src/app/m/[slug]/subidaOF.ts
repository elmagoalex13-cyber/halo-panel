// Subida de archivos de OnlyFans desde el portal: directo a R2 con URL firmada, byte a byte (sin recomprimir).
// Archivos pequeños: una sola peticion. Grandes (>64 MB): por partes de 16 MB, 4 a la vez.

type Preparada =
  | { key: string; modo: "single"; url: string; contentType: string }
  | { key: string; modo: "multipart"; uploadId: string; partSize: number; parts: Array<{ partNumber: number; url: string }>; contentType: string };

export type DestinoOF = { coleccionId: string; fase?: number; slot?: string };

/** Duracion del video leyendo solo sus metadatos (no sube nada). null si el navegador no puede (HEVC .MOV, etc.). */
export function leerDuracion(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("video/") && !/\.(mov|mp4|m4v|webm)$/i.test(file.name)) return resolve(null);
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const fin = (d: number | null) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(d);
    };
    const t = setTimeout(() => fin(null), 5000);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      clearTimeout(t);
      fin(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null);
    };
    v.onerror = () => {
      clearTimeout(t);
      fin(null);
    };
    v.src = url;
  });
}

function putConProgreso(url: string, cuerpo: Blob, contentType: string | null, onProgress: (loaded: number) => void) {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onerror = () => reject(new Error("Se cortó la conexión durante la subida. Prueba otra vez."));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`La subida falló (${xhr.status})`));
      resolve(xhr.getResponseHeader("ETag"));
    };
    xhr.send(cuerpo);
  });
}

async function json<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((j as { error?: string }).error ?? (res.status === 401 ? "Tu sesión ha caducado, vuelve a entrar" : `Error ${res.status}`));
  return j;
}

export async function subirArchivoOF(file: File, destino: DestinoOF, onProgress: (loaded: number) => void) {
  const contentType = file.type || (/\.(mov)$/i.test(file.name) ? "video/quicktime" : /\.(heic|heif)$/i.test(file.name) ? "image/heic" : "application/octet-stream");

  const pre = await json<Preparada>(
    await fetch("/api/portal/of/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coleccion_id: destino.coleccionId, fase: destino.fase, slot: destino.slot, filename: file.name, contentType, size: file.size }),
    }),
  );

  if (pre.modo === "single") {
    await putConProgreso(pre.url, file, pre.contentType, onProgress);
  } else {
    const cargado = new Map<number, number>();
    const etags: Array<{ partNumber: number; etag: string }> = [];
    let siguiente = 0;
    const informar = () => onProgress(Array.from(cargado.values()).reduce((a, b) => a + b, 0));
    await Promise.all(
      Array.from({ length: Math.min(4, pre.parts.length) }, async () => {
        while (siguiente < pre.parts.length) {
          const parte = pre.parts[siguiente++];
          const ini = (parte.partNumber - 1) * pre.partSize;
          const trozo = file.slice(ini, Math.min(ini + pre.partSize, file.size));
          let intento = 0;
          for (;;) {
            try {
              const etag = await putConProgreso(parte.url, trozo, null, (l) => {
                cargado.set(parte.partNumber, l);
                informar();
              });
              if (!etag) throw new Error("R2 no confirmó una parte");
              etags.push({ partNumber: parte.partNumber, etag });
              cargado.set(parte.partNumber, trozo.size);
              informar();
              break;
            } catch (e) {
              if (++intento >= 3) throw e;
              await new Promise((r) => setTimeout(r, 1500 * intento));
            }
          }
        }
      }),
    );
    await json(
      await fetch("/api/portal/of/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: pre.key, uploadId: pre.uploadId, parts: etags }),
      }),
    );
  }
  onProgress(file.size);

  const duracion = await leerDuracion(file);
  return json<{ archivo: import("@/lib/onlyfans").ArchivoOF; vista: string | null }>(
    await fetch("/api/portal/of/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coleccion_id: destino.coleccionId,
        key: pre.key,
        fase: destino.fase,
        slot: destino.slot,
        nombre_original: file.name,
        size: file.size,
        mime: file.type || contentType,
        duracion_seg: duracion,
      }),
    }),
  );
}
