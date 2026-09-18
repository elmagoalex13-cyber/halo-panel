"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function subir(file: File) {
    setMensaje(null);
    setProgreso(0);
    try {
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
        body: JSON.stringify({ key, filename: file.name, size: file.size, tipo, encargo_id: encargoId, referencia_id: referenciaId }),
      });
      if (!reg.ok) {
        const j = (await reg.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "No se pudo registrar el video");
      }
      setMensaje({ ok: true, texto: "Video enviado. Ya lo estamos editando." });
      router.refresh();
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : "Error al subir" });
    } finally {
      setProgreso(null);
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
        className="hidden"
        onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
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
            <span className="relative">Subiendo {progreso}%</span>
          </>
        ) : (
          <span>⬆ {etiqueta}</span>
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
