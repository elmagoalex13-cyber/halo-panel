"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { Upload } from "lucide-react";

type PresignResponse = {
  provider: "supabase";
  bucket: string;
  path: string;
  token: string;
  key: string;
  contentType: string;
  uploadEndpoint: string | null;
} | {
  provider: "r2-multipart";
  key: string;
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
  contentType: string;
};

export function SubirBoton({
  tipo,
  encargoId,
  referenciaId,
  etiqueta = "Subir mi video",
}: {
  tipo: number;
  encargoId?: string;
  referenciaId?: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [actual, setActual] = useState<{ index: number; total: number } | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function subirUno(file: File, index: number, onProgress: (loaded: number) => void) {
    const pre = await conReintentos(
      async () => {
        const r = await fetch("/api/portal/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
        });
        if (r.status === 401) throw new ErrorFinal("Tu sesión ha caducado: vuelve a entrar en tu portal y repite la subida.");
        if (!r.ok) throw new ErrorTemporal("No se pudo preparar la subida");
        return r;
      },
      3,
    );
    const prepared = (await pre.json()) as PresignResponse;

    if (prepared.provider === "r2-multipart") {
      await subirConR2Multipart({ file, prepared, onProgress });
    } else {
      const { bucket, path, token, contentType, uploadEndpoint } = prepared;
      if (!uploadEndpoint) throw new Error("No se pudo preparar la subida");
      await subirConTus({ file, bucket, path, token, contentType, uploadEndpoint, onProgress });
    }

    // El archivo YA esta en el almacen: registrarlo se reintenta varias veces (el servidor lo reconoce si ya estaba, no se duplica)
    return conReintentos(
      async () => {
        const reg = await fetch("/api/portal/subir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: prepared.key,
            filename: file.name,
            size: file.size,
            tipo,
            encargo_id: index === 0 ? encargoId : undefined,
            referencia_id: referenciaId,
          }),
        });
        if (reg.ok) return (await reg.json().catch(() => ({}))) as { repetido?: boolean };
        const j = (await reg.json().catch(() => null)) as { error?: string } | null;
        if (reg.status >= 500) throw new ErrorTemporal(j?.error ?? "No se pudo registrar el video");
        throw new ErrorFinal(reg.status === 401 ? "Tu sesión ha caducado: vuelve a entrar en tu portal." : (j?.error ?? "No se pudo registrar el video"));
      },
      4,
    );
  }

  async function subir(files: File[]) {
    setMensaje(null);
    setProgreso(0);
    setActual({ index: 0, total: files.length });
    const totalBytes = files.reduce((acc, file) => acc + file.size, 0) || 1;
    const loadedByFile = Array(files.length).fill(0) as number[];
    const concurrency = Math.min(3, files.length);
    let nextIndex = 0;
    let completed = 0;
    const subidos: string[] = [];
    const repetidos: string[] = [];
    const fallos: Array<{ nombre: string; motivo: string }> = [];
    const pantalla = await mantenerPantalla();

    const updateProgress = (index: number, loaded: number) => {
      loadedByFile[index] = loaded;
      const totalLoaded = loadedByFile.reduce((acc, value) => acc + value, 0);
      setProgreso(Math.min(100, Math.round((totalLoaded / totalBytes) * 100)));
    };

    // Cada video va por su cuenta: si uno falla, los demas siguen y al final se dice EXACTAMENTE cual (antes un fallo daba «error» para todos aunque se hubieran subido)
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (nextIndex < files.length) {
          const index = nextIndex++;
          setActual({ index, total: files.length });
          try {
            const r = await subirUno(files[index], index, (loaded) => updateProgress(index, loaded));
            if (r?.repetido) repetidos.push(files[index].name);
            else subidos.push(files[index].name);
            updateProgress(index, files[index].size);
          } catch (e) {
            fallos.push({ nombre: files[index].name, motivo: textoError(e) });
          }
          completed++;
          setActual({ index: completed - 1, total: files.length });
        }
      }),
    );
    pantalla?.release().catch(() => undefined);

    const buenos = subidos.length + repetidos.length;
    if (!fallos.length) {
      setMensaje({
        ok: true,
        texto:
          repetidos.length && !subidos.length
            ? files.length === 1
              ? "Ese vídeo ya lo habías subido: está guardado, no hace falta repetirlo."
              : `Esos ${files.length} vídeos ya estaban subidos: no hace falta repetirlos.`
            : files.length === 1
              ? "¡Vídeo subido!"
              : `¡${files.length} vídeos subidos!${repetidos.length ? ` (${repetidos.length} ya estaban)` : ""}`,
      });
    } else {
      const lista = fallos.map((f) => f.nombre).join(", ");
      setMensaje({
        ok: false,
        texto: `${buenos ? `Se han subido ${buenos} de ${files.length}. ` : ""}No se ha podido subir: ${lista}. ${fallos[0].motivo} Lo que ya se subió está guardado: solo tienes que volver a elegir ${fallos.length === 1 ? "ese vídeo" : "esos vídeos"}.`,
      });
    }
    // Siempre se vuelve a cargar la pagina: asi los contadores («Subidos», «Por grabar») reflejan lo que de verdad se ha guardado
    router.refresh();
    setProgreso(null);
    setActual(null);
    if (input.current) input.current.value = "";
  }

  const subiendo = progreso !== null;
  return (
    <div>
      {/* Etiqueta nativa en vez de input.click(): asi el selector se abre tambien en el movil y en los navegadores de WhatsApp o Instagram */}
      <label className={`btn-primary relative flex h-12 w-full cursor-pointer items-center justify-center overflow-hidden text-base ${subiendo ? "pointer-events-none opacity-80" : ""}`}>
        <input
          ref={input}
          type="file"
          accept="video/*"
          multiple
          disabled={subiendo}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void subir(files);
          }}
        />
        {subiendo ? (
          <>
            <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progreso}%` }} />
            <span className="relative">
              Subiendo {actual && actual.total > 1 ? `${actual.index + 1}/${actual.total} · ` : ""}
              {progreso}%
            </span>
          </>
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {etiqueta}
          </span>
        )}
      </label>
      {subiendo ? <p className="mt-2 text-center text-xs text-white/45">Mantén esta pantalla abierta hasta que termine. Si te sales de la página o se bloquea el móvil, la subida se corta.</p> : null}
      {mensaje ? (
        <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${mensaje.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
          {mensaje.texto}
        </p>
      ) : null}
    </div>
  );
}

/** Error que no merece reintento (sesion caducada, archivo no valido...). */
class ErrorFinal extends Error {}
/** Error pasajero (red, servidor ocupado): se reintenta. */
class ErrorTemporal extends Error {}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function conReintentos<T>(fn: () => Promise<T>, intentos: number): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErrorFinal) throw e;
      ultimo = e;
      if (i < intentos - 1) await esperar(600 * 2 ** i); // 0,6 s, 1,2 s, 2,4 s...
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Error al subir");
}

/** Mensaje claro para la modelo (sin palabras tecnicas). */
function textoError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (e instanceof ErrorFinal) return m;
  if (/load failed|failed to fetch|network|conexion|conexión|se corto|timeout|abort/i.test(m) || !m) return "Se cortó la conexión mientras subía (comprueba tu internet o la cobertura).";
  if (/subida fallo|confirmacion|confirmación|finalizar|preparar|registrar/i.test(m)) return "No se pudo completar la subida en este momento.";
  return `${m}.`;
}

/** Mantiene la pantalla encendida mientras sube (si el movil se bloquea o cambia de app, la subida se corta). */
async function mantenerPantalla(): Promise<{ release: () => Promise<void> } | null> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}

function subirConTus({
  file,
  bucket,
  path,
  token,
  contentType,
  uploadEndpoint,
  onProgress,
}: {
  file: File;
  bucket: string;
  path: string;
  token: string;
  contentType: string;
  uploadEndpoint: string;
  onProgress: (loaded: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: uploadEndpoint,
      retryDelays: [0, 1500, 3000, 6000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "x-signature": token,
      },
      onError: (error) => {
        reject(new Error(error.message || "La subida fallo, prueba otra vez"));
      },
      onProgress: (bytesUploaded) => {
        onProgress(bytesUploaded);
      },
      onSuccess: () => {
        onProgress(file.size);
        resolve();
      },
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch((error) => {
      reject(error instanceof Error ? error : new Error("La subida fallo, prueba otra vez"));
    });
  });
}

async function subirConR2Multipart({
  file,
  prepared,
  onProgress,
}: {
  file: File;
  prepared: Extract<PresignResponse, { provider: "r2-multipart" }>;
  onProgress: (loaded: number) => void;
}) {
  const loadedByPart = new Map<number, number>();
  const uploadedParts: { partNumber: number; etag: string }[] = [];
  let nextPart = 0;
  const concurrency = Math.min(4, prepared.parts.length);

  const report = (partNumber: number, loaded: number) => {
    loadedByPart.set(partNumber, loaded);
    onProgress(Array.from(loadedByPart.values()).reduce((acc, value) => acc + value, 0));
  };

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextPart < prepared.parts.length) {
        const part = prepared.parts[nextPart++];
        const start = (part.partNumber - 1) * prepared.partSize;
        const chunk = file.slice(start, Math.min(start + prepared.partSize, file.size), prepared.contentType);
        const etag = await conReintentos(() => putPart(part.url, chunk, (loaded) => report(part.partNumber, loaded)), 4); // si se corta la red un momento, solo se repite esa parte
        uploadedParts.push({ partNumber: part.partNumber, etag });
        report(part.partNumber, chunk.size);
      }
    }),
  );

  await conReintentos(async () => {
    const complete = await fetch("/api/portal/r2-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: prepared.key, uploadId: prepared.uploadId, parts: uploadedParts }),
    });
    if (complete.ok) return;
    const j = (await complete.json().catch(() => null)) as { error?: string } | null;
    if (complete.status === 401) throw new ErrorFinal("Tu sesión ha caducado: vuelve a entrar en tu portal.");
    throw new ErrorTemporal(j?.error ?? "No se pudo finalizar la subida");
  }, 3);
  onProgress(file.size);
}

function putPart(url: string, chunk: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onerror = () => reject(new ErrorTemporal("La conexion se corto durante la subida"));
    xhr.ontimeout = () => reject(new ErrorTemporal("La conexion se corto durante la subida"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`La subida fallo (${xhr.status})`));
        return;
      }
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        reject(new Error("R2 no devolvio confirmacion de la parte subida"));
        return;
      }
      resolve(etag);
    };
    xhr.send(chunk);
  });
}
