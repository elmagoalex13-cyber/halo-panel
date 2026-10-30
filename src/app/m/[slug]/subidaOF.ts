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
    // Si lleva 60 s sin avanzar (conexion colgada, no solo lenta) se cancela y se repite
    let vigilante = 0;
    const armar = () => {
      window.clearTimeout(vigilante);
      vigilante = window.setTimeout(() => xhr.abort(), 60000);
    };
    armar();
    xhr.upload.onprogress = (e) => {
      armar();
      if (e.lengthComputable) onProgress(e.loaded);
    };
    const corte = () => {
      window.clearTimeout(vigilante);
      reject(new Error("Se cortó la conexión durante la subida. Prueba otra vez."));
    };
    xhr.onerror = corte;
    xhr.onabort = corte;
    xhr.onload = () => {
      window.clearTimeout(vigilante);
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

/** Copia pequena de la foto (JPEG ~480 px) para pintarla rapido en el movil. null si el navegador no puede leerla. */
async function crearMiniatura(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fallo) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fallo(new Error("no se pudo leer la foto"));
      i.src = url;
    });
    const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * k));
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * k));
    lienzo.getContext("2d")?.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob | null>((ok) => lienzo.toBlob((b) => ok(b), "image/jpeg", 0.72));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Repite un paso si falla por la red (cortes, cobertura que va y viene). Los errores del servidor con mensaje claro no se repiten. */
async function conReintentos<T>(paso: () => Promise<T>, veces = 7): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await paso();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      const definitivo = /sesión|no válido|Solo fotos|incompleto|No se encontró/i.test(m);
      if (definitivo || i >= veces) throw e;
      await new Promise((r) => setTimeout(r, Math.min(10000, 1200 * 2 ** (i - 1))));
      if (typeof navigator !== "undefined" && navigator.onLine === false) await new Promise<void>((ok) => { window.addEventListener("online", () => ok(), { once: true }); window.setTimeout(ok, 120000); });
    }
  }
}

export async function subirArchivoOF(file: File, destino: DestinoOF, onProgress: (loaded: number) => void) {
  const contentType = file.type || (/\.(mov)$/i.test(file.name) ? "video/quicktime" : /\.(heic|heif)$/i.test(file.name) ? "image/heic" : "application/octet-stream");

  const pre = await conReintentos(async () =>
    json<Preparada>(
      await fetch("/api/portal/of/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coleccion_id: destino.coleccionId, fase: destino.fase, slot: destino.slot, filename: file.name, contentType, size: file.size }),
      }),
    ),
  );

  if (pre.modo === "single") {
    await conReintentos(() => putConProgreso(pre.url, file, pre.contentType, onProgress));
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
              if (++intento >= 10) throw e;
              await new Promise((r) => setTimeout(r, Math.min(12000, 1500 * intento)));
              if (typeof navigator !== "undefined" && navigator.onLine === false) await new Promise<void>((ok) => { window.addEventListener("online", () => ok(), { once: true }); window.setTimeout(ok, 120000); });
            }
          }
        }
      }),
    );
    await conReintentos(async () =>
      json(
        await fetch("/api/portal/of/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: pre.key, uploadId: pre.uploadId, parts: etags }),
        }),
      ),
    );
  }
  onProgress(file.size);

  const duracion = await leerDuracion(file);
  const registro = await conReintentos(async () =>
    json<{ archivo: import("@/lib/onlyfans").ArchivoOF; vista: string | null }>(
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
    ),
  );

  // Fotos: miniatura al momento (se ve al instante, sin volver a bajar la original) y se guarda para las proximas veces
  let vistaLocal: string | null = null;
  if (registro.archivo.tipo_archivo === "foto") {
    const mini = await crearMiniatura(file);
    if (mini) {
      vistaLocal = URL.createObjectURL(mini);
      void fetch(`/api/portal/of/miniatura?id=${registro.archivo.id}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: mini, keepalive: true }).catch(() => undefined);
    }
  }
  return { ...registro, vistaLocal };
}
