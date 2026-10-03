"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { EVENTO_MODELOS } from "@/components/Sidebar";

const LADO_MAX = 640;

// Reduce la foto en el navegador (cuadrada, 640px, JPEG) antes de subirla: pesa ~50-120 KB
// aunque la original sea una foto de movil de varios MB.
async function prepararFoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const lado = Math.min(bitmap.width, bitmap.height);
  const destino = Math.min(LADO_MAX, lado);
  const canvas = document.createElement("canvas");
  canvas.width = destino;
  canvas.height = destino;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, destino, destino);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

export function FotoModelo({
  modeloId,
  nombre,
  version,
  className = "h-16 w-16 rounded-2xl text-2xl",
}: {
  modeloId: string;
  nombre: string;
  version: number | null;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [v, setV] = useState<number | null>(version);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const listo = await prepararFoto(file);
      const body = new FormData();
      body.append("file", listo);
      const res = await fetch(`/api/modelos/${modeloId}/foto`, { method: "PUT", body });
      const j = (await res.json().catch(() => null)) as { v?: number; error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "No se pudo subir la foto");
      setV(j?.v ?? Date.now());
      window.dispatchEvent(new Event(EVENTO_MODELOS));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar la foto de ${nombre}?`)) return;
    setSubiendo(true);
    setError(null);
    const res = await fetch(`/api/modelos/${modeloId}/foto`, { method: "DELETE" });
    setSubiendo(false);
    if (res.ok) {
      setV(null);
      window.dispatchEvent(new Event(EVENTO_MODELOS));
    }
    else setError("No se pudo quitar la foto");
  }

  return (
    <div className="shrink-0">
      <div className={`group relative overflow-hidden border border-white/[0.08] bg-white/[0.04] ${className}`}>
        {v ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/modelos/${modeloId}/foto?v=${v}`} alt={`Foto de ${nombre}`} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center font-display font-semibold text-white">{nombre.slice(0, 1).toUpperCase()}</span>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          aria-label={v ? `Cambiar la foto de ${nombre}` : `Añadir foto a ${nombre}`}
          title={v ? "Cambiar foto" : "Añadir foto"}
          className={`absolute inset-0 grid place-items-center bg-black/55 text-white transition ${
            subiendo ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          }`}
        >
          {subiendo ? <span className="text-[10px] font-semibold">Subiendo…</span> : <Camera className="h-5 w-5" />}
        </button>
        {v && !subiendo ? (
          <button
            type="button"
            onClick={quitar}
            aria-label={`Quitar la foto de ${nombre}`}
            title="Quitar foto"
            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-red-500/80 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 max-w-24 text-[10px] leading-tight text-red-300">{error}</p> : null}
    </div>
  );
}
