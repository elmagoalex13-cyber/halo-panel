"use client";

import { useEffect, useState, useRef } from "react";

type Asignacion = {
  id: string;
  tipo: string;
  r2_key_referencia: string | null;
  url_referencia_video: string | null;
  url_referencia_ig: string | null;
  instrucciones: string | null;
  estado: string;
  creado_en: string;
};

type Modelo = { id: string; nombre: string };

type UploadState = "idle" | "uploading" | "done" | "error";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function presignAndUpload(
  file: File,
  key: string,
  onProgress: (pct: number) => void
): Promise<string> {
  // Get presigned URL
  const res = await fetch("/api/r2/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType: file.type || "video/mp4" }),
  });
  const { url, publicUrl } = await res.json();

  // Upload directly to R2
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.send(file);
  });

  return publicUrl;
}

function TipoLabel({ tipo }: { tipo: string }) {
  const map: Record<string, { label: string; color: string; emoji: string }> = {
    referencia: { label: "Con referencia", color: "bg-purple-500/20 text-purple-300", emoji: "🎬" },
    frase: { label: "Frase + música", color: "bg-blue-500/20 text-blue-300", emoji: "🎵" },
    subtitulos: { label: "Subtítulos", color: "bg-cyan-500/20 text-cyan-300", emoji: "📝" },
    libre: { label: "Libre", color: "bg-zinc-500/20 text-zinc-300", emoji: "✨" },
  };
  const t = map[tipo] ?? { label: tipo, color: "bg-zinc-500/20 text-zinc-300", emoji: "📹" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.color}`}>
      {t.emoji} {t.label}
    </span>
  );
}

function AsignacionCard({
  a,
  token,
  onDone,
}: {
  a: Asignacion;
  token: string;
  onDone: (id: string) => void;
}) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploadState("uploading");
    setProgress(0);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "mp4";
      const key = `brutos/${token}/${a.id}/${Date.now()}.${ext}`;
      await presignAndUpload(file, key, setProgress);

      // Notify backend
      const res = await fetch(`/api/portal/${token}/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          r2_key: key,
          filename: file.name,
          size_bytes: file.size,
          mimetype: file.type || "video/mp4",
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setUploadState("done");
      setTimeout(() => onDone(a.id), 1200);
    } catch (e) {
      setError(String(e));
      setUploadState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <TipoLabel tipo={a.tipo} />
        <span className="text-xs text-white/30">
          {new Date(a.creado_en).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
        </span>
      </div>

      {a.instrucciones && (
        <p className="mb-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/80">{a.instrucciones}</p>
      )}

      {/* Vídeo de referencia */}
      {a.url_referencia_video && (
        <div className="mb-4">
          <button
            onClick={() => setShowRef((v) => !v)}
            className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-300"
          >
            <span>{showRef ? "▼" : "▶"}</span> Ver vídeo de referencia
          </button>
          {showRef && (
            <video
              src={a.url_referencia_video}
              controls
              playsInline
              className="w-full rounded-xl bg-black"
              style={{ maxHeight: 400 }}
            />
          )}
          {a.url_referencia_ig && (
            <a
              href={a.url_referencia_ig}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-xs text-white/30 hover:text-white/60"
            >
              ↗ Ver en Instagram
            </a>
          )}
        </div>
      )}

      {/* Upload */}
      {uploadState === "idle" || uploadState === "error" ? (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-white/20 bg-white/5 py-4 text-sm text-white/60 transition-colors hover:border-purple-400/50 hover:bg-purple-500/5 hover:text-white active:scale-[0.98]"
          >
            📤 Subir mi vídeo
          </button>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      ) : uploadState === "uploading" ? (
        <div>
          <div className="mb-2 flex justify-between text-xs text-white/50">
            <span>Subiendo…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-purple-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-300">
          ✅ Subido correctamente
        </div>
      )}
    </div>
  );
}

export function PortalClient({ token }: { token: string }) {
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Batch upload state
  const batchRef = useRef<HTMLInputElement>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchStates, setBatchStates] = useState<Record<string, { pct: number; done: boolean; error?: string }>>({});
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchDone, setBatchDone] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setModelo(d.modelo);
        setAsignaciones(d.asignaciones ?? []);
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [token]);

  function handleDone(id: string) {
    setAsignaciones((prev) => prev.filter((a) => a.id !== id));
  }

  async function uploadBatch() {
    if (!batchFiles.length) return;
    setBatchUploading(true);
    setBatchDone(false);
    const results: { r2_key: string; filename: string; size_bytes: number; tipo: string }[] = [];

    for (const file of batchFiles) {
      const name = file.name;
      setBatchStates((p) => ({ ...p, [name]: { pct: 0, done: false } }));
      try {
        const ext = name.split(".").pop() ?? "mp4";
        const key = `brutos/${token}/lote/${Date.now()}-${name}`;
        await presignAndUpload(file, key, (pct) =>
          setBatchStates((p) => ({ ...p, [name]: { pct, done: false } }))
        );
        setBatchStates((p) => ({ ...p, [name]: { pct: 100, done: true } }));
        results.push({ r2_key: key, filename: name, size_bytes: file.size, tipo: "sin_clasificar" });
      } catch (e) {
        setBatchStates((p) => ({ ...p, [name]: { pct: 0, done: false, error: String(e) } }));
      }
    }

    if (results.length) {
      await fetch(`/api/portal/${token}/lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos: results }),
      });
    }
    setBatchUploading(false);
    setBatchDone(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070710]">
        <div className="text-white/40">Cargando…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070710]">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-white/40">Enlace no válido</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070710] px-4 py-8 text-white">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl">🎬</div>
          <h1 className="font-display text-2xl font-semibold text-white">
            Hola, {modelo?.nombre ?? ""}
          </h1>
          <p className="mt-1 text-sm text-white/40">Aquí tienes tus pendientes</p>
        </div>

        {/* Pendientes con referencia */}
        {asignaciones.length > 0 ? (
          <div className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/30">
              Pendientes · {asignaciones.length}
            </h2>
            <div className="space-y-4">
              {asignaciones.map((a) => (
                <AsignacionCard key={a.id} a={a} token={token} onDone={handleDone} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-white/50 text-sm">No tienes pendientes con referencia</p>
          </div>
        )}

        {/* Subida en lote — sin referencia */}
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/30">
            Subir vídeos libres
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="mb-4 text-sm text-white/50">
              Vídeos de frases, subtítulos o material libre — selecciona todos de una.
            </p>

            {/* Drop zone */}
            <input
              ref={batchRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setBatchFiles(files);
                setBatchStates({});
                setBatchDone(false);
              }}
            />
            <button
              onClick={() => batchRef.current?.click()}
              className="mb-4 w-full rounded-xl border border-dashed border-white/20 bg-white/5 py-4 text-sm text-white/60 hover:border-purple-400/50 hover:bg-purple-500/5 hover:text-white"
            >
              {batchFiles.length > 0
                ? `${batchFiles.length} vídeo${batchFiles.length > 1 ? "s" : ""} seleccionado${batchFiles.length > 1 ? "s" : ""} — toca para cambiar`
                : "📁 Seleccionar vídeos"}
            </button>

            {/* File list with progress */}
            {batchFiles.length > 0 && (
              <div className="mb-4 space-y-2">
                {batchFiles.map((f) => {
                  const st = batchStates[f.name];
                  return (
                    <div key={f.name} className="rounded-xl bg-white/5 px-3 py-2">
                      <div className="flex justify-between text-xs">
                        <span className="truncate text-white/70 max-w-[60%]">{f.name}</span>
                        <span className="text-white/30">{formatBytes(f.size)}</span>
                      </div>
                      {st && (
                        <div className="mt-1.5">
                          {st.error ? (
                            <p className="text-xs text-red-400">{st.error}</p>
                          ) : (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full transition-all ${st.done ? "bg-green-400" : "bg-purple-500"}`}
                                style={{ width: `${st.pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {batchDone ? (
              <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-300">
                ✅ Todos subidos correctamente
              </div>
            ) : (
              <button
                onClick={uploadBatch}
                disabled={batchFiles.length === 0 || batchUploading}
                className="w-full rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-40 active:scale-[0.98]"
              >
                {batchUploading ? "Subiendo…" : `Subir ${batchFiles.length > 0 ? batchFiles.length + " vídeo" + (batchFiles.length > 1 ? "s" : "") : "vídeos"}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
