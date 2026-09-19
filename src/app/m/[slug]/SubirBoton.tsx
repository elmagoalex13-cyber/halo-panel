"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Upload } from "lucide-react";

const supabaseBrowser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

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
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!pre.ok) throw new Error(pre.status === 401 ? "Tu sesion ha caducado, vuelve a entrar" : "No se pudo preparar la subida");
    const { bucket, path, token, key, contentType } = (await pre.json()) as { bucket: string; path: string; token: string; key: string; contentType: string };

    onProgress(Math.max(1, Math.round(file.size * 0.03)));
    const { error } = await supabaseBrowser.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType });
    if (error) throw new Error(error.message || "La subida fallo, prueba otra vez");
    onProgress(file.size);

    const reg = await fetch("/api/portal/subir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
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
