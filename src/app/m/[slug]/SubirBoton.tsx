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
    const pre = await fetch("/api/portal/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
    });
    if (!pre.ok) throw new Error(pre.status === 401 ? "Tu sesion ha caducado, vuelve a entrar" : "No se pudo preparar la subida");
    const prepared = (await pre.json()) as PresignResponse;

    if (prepared.provider === "r2-multipart") {
      await subirConR2Multipart({ file, prepared, onProgress });
    } else {
      const { bucket, path, token, contentType, uploadEndpoint } = prepared;
      if (!uploadEndpoint) throw new Error("No se pudo preparar la subida");
      await subirConTus({ file, bucket, path, token, contentType, uploadEndpoint, onProgress });
    }

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
    if (!reg.ok) {
      const j = (await reg.json().catch(() => null)) as { error?: string } | null;
      throw new Error(j?.error ?? "No se pudo registrar el video");
    }
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

    const updateProgress = (index: number, loaded: number) => {
      loadedByFile[index] = loaded;
      const totalLoaded = loadedByFile.reduce((acc, value) => acc + value, 0);
      setProgreso(Math.min(100, Math.round((totalLoaded / totalBytes) * 100)));
    };

    try {
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (nextIndex < files.length) {
            const index = nextIndex++;
            setActual({ index, total: files.length });
            await subirUno(files[index], index, (loaded) => updateProgress(index, loaded));
            completed++;
            setActual({ index: completed - 1, total: files.length });
          }
        }),
      );
      setMensaje({ ok: true, texto: files.length === 1 ? "Video subido." : `${files.length} videos subidos.` });
      router.refresh();
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : "Error al subir" });
    } finally {
      setProgreso(null);
      setActual(null);
      if (input.current) input.current.value = "";
    }
  }

  const subiendo = progreso !== null;
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void subir(files);
        }}
      />
      <button
        type="button"
        disabled={subiendo}
        onClick={() => input.current?.click()}
        className="btn-primary relative h-12 w-full overflow-hidden text-base disabled:opacity-80"
      >
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
      </button>
      {mensaje ? (
        <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${mensaje.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
          {mensaje.texto}
        </p>
      ) : null}
    </div>
  );
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
        const etag = await putPart(part.url, chunk, (loaded) => report(part.partNumber, loaded));
        uploadedParts.push({ partNumber: part.partNumber, etag });
        report(part.partNumber, chunk.size);
      }
    }),
  );

  const complete = await fetch("/api/portal/r2-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: prepared.key, uploadId: prepared.uploadId, parts: uploadedParts }),
  });
  if (!complete.ok) {
    const j = (await complete.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "No se pudo finalizar la subida");
  }
  onProgress(file.size);
}

function putPart(url: string, chunk: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onerror = () => reject(new Error("La conexion se corto durante la subida"));
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
