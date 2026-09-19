"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

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

  async function subirUno(file: File, index: number) {
    const pre = await fetch("/api/portal/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!pre.ok) throw new Error(pre.status === 401 ? "Tu sesion ha caducado, vuelve a entrar" : "No se pudo preparar la subida");
    const { url, key, contentType } = (await pre.json()) as { url: string; key: string; contentType: string };

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgreso(Math.round((ev.loaded / ev.total) * 100));
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("La subida fallo, prueba otra vez")));
      xhr.onerror = () => reject(new Error("Sin conexion. Prueba otra vez con mejor cobertura"));
      xhr.send(file);
    });

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
    try {
      for (let i = 0; i < files.length; i++) {
        setActual({ index: i, total: files.length });
        setProgreso(0);
        await subirUno(files[i], i);
      }
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
