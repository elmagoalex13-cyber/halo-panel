"use client";

import { useState, useRef } from "react";

interface Modelo {
  id: string;
  nombre: string;
}

interface Props {
  modelos: Modelo[];
}

type Modal = "none" | "upload" | "url";

export function BibliotecaUploadBar({ modelos }: Props) {
  const [modal, setModal] = useState<Modal>("none");
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? "");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [urlText, setUrlText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function close() {
    setModal("none");
    setResult(null);
    setError(null);
    setUrlText("");
    setProgress(0);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !modeloId) return;
    if (!file.type.startsWith("video/")) { setError("Solo archivos de vídeo"); return; }
    if (file.size > 500 * 1024 * 1024) { setError("Máximo 500 MB"); return; }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("modelo_id", modeloId);
      form.append("tipo_video", "sin_clasificar");
      form.append("estado", "recibido");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            try { reject(new Error(JSON.parse(xhr.responseText).error)); }
            catch { reject(new Error("Error al subir")); }
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Error de red")));
        xhr.open("POST", "/api/upload");
        xhr.send(form);
      });

      setResult("✅ Vídeo subido — aparecerá en la tabla en segundos");
      if (fileRef.current) fileRef.current.value = "";
      setProgress(0);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setUploading(false);
    }
  }

  async function handleImportUrl() {
    if (!modeloId || !urlText.trim()) {
      setError("Selecciona modelo e introduce al menos una URL");
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    const urls = urlText.split("\n").map((u) => u.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/biblioteca/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo_id: modeloId, urls }),
      });
      const data = await res.json();
      const s = data.summary;
      if (s) {
        setResult(`✅ ${s.ok} importadas · ${s.duplicates} duplicadas · ${s.errors} errores`);
        if (s.ok > 0) setTimeout(() => window.location.reload(), 2000);
      } else {
        setError(data.error ?? "Error desconocido");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setUploading(false);
    }
  }

  const btnBase = "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors";

  return (
    <>
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setModal("upload")}
          className={`${btnBase} bg-[#8B5CF6] text-white hover:bg-[#7C3AED] shadow-[0_2px_8px_rgba(139,92,246,0.35)]`}
        >
          📤 Subir vídeo
        </button>
        <button
          onClick={() => setModal("url")}
          className={`${btnBase} border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white`}
        >
          🔗 Importar por URL
        </button>
      </div>

      {modal !== "none" && (
        <div
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#0a0a12] p-7 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-zinc-100">
                {modal === "upload" ? "📤 Subir vídeo manual" : "🔗 Importar por URL"}
              </h2>
              <button onClick={close} className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none">×</button>
            </div>

            {/* Modelo selector */}
            <label className="block mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Modelo</label>
            <select
              value={modeloId}
              onChange={(e) => setModeloId(e.target.value)}
              className="w-full mb-5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
            >
              <option value="">— Selecciona modelo —</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>

            {modal === "upload" ? (
              <>
                <label className="block mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Vídeo (MP4, MOV — máx. 500 MB)
                </label>
                {uploading ? (
                  <div className="mb-4">
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-sm font-semibold text-[#8B5CF6]">Subiendo... {progress}%</p>
                  </div>
                ) : (
                  <label className="block mb-4 cursor-pointer">
                    <div className="rounded-xl border-2 border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500 hover:border-[#8B5CF6] transition-colors">
                      Arrastra un vídeo aquí o haz clic para elegirlo
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="video/*"
                      onChange={handleUpload}
                      disabled={!modeloId}
                      className="hidden"
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <label className="block mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  URLs (una por línea, máx. 100)
                </label>
                <textarea
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  placeholder={"https://pub-xxx.r2.dev/bruto/...\nhttps://..."}
                  rows={6}
                  className="w-full mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 font-mono focus:border-[#8B5CF6] focus:outline-none resize-y"
                />
                <button
                  onClick={handleImportUrl}
                  disabled={uploading || !modeloId || !urlText.trim()}
                  className="w-full py-3 mb-3 rounded-xl bg-[#8B5CF6] text-sm font-bold text-white disabled:opacity-40 hover:bg-[#7C3AED] transition-colors"
                >
                  {uploading ? "Importando..." : "🔗 Importar URLs"}
                </button>
              </>
            )}

            {result && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400">
                {result}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
