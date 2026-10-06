"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ImageIcon, X } from "lucide-react";
import { formatoDuracion, formatoTamano } from "@/lib/onlyfans";

export type ItemVisor = {
  id: string;
  tipo_archivo: "video" | "foto";
  nombre_original: string | null;
  size_bytes: number | null;
  duracion_seg: number | null;
  vista: string | null; // enlace firmado para ver fotos; los videos se piden a /api/onlyfans/vista
  etiqueta?: string; // "Fase 3 · foto 2"
};

// Visor a pantalla completa: ver la foto o el video tal cual (sin descargar) y, si hace falta, descargarlo desde el boton.
export function Visor({ items, indice, onCambio, onCerrar }: { items: ItemVisor[]; indice: number; onCambio: (i: number) => void; onCerrar: () => void }) {
  const a = items[indice];
  const [fallo, setFallo] = useState(false);

  const ir = useCallback(
    (d: number) => {
      const n = indice + d;
      if (n >= 0 && n < items.length) {
        setFallo(false);
        onCambio(n);
      }
    },
    [indice, items.length, onCambio],
  );

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = previo;
    };
  }, [ir, onCerrar]);

  if (!a) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{a.nombre_original ?? (a.tipo_archivo === "video" ? "Vídeo" : "Foto")}</p>
          <p className="text-xs text-white/45">
            {[a.etiqueta, a.tipo_archivo === "video" ? formatoDuracion(a.duracion_seg) : null, formatoTamano(a.size_bytes), `${indice + 1} de ${items.length}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <a
          href={`/api/onlyfans/descargar?id=${a.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-[#8B5CF6]/50 bg-[#8B5CF6]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#8B5CF6]/40"
        >
          <Download className="h-4 w-4" /> Descargar
        </a>
        <button onClick={onCerrar} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
        {indice > 0 ? (
          <button onClick={(e) => { e.stopPropagation(); ir(-1); }} aria-label="Anterior" className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        {indice < items.length - 1 ? (
          <button onClick={(e) => { e.stopPropagation(); ir(1); }} aria-label="Siguiente" className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}

        <div className="flex max-h-full max-w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {a.tipo_archivo === "video" ? (
            <video key={a.id} src={`/api/onlyfans/vista?id=${a.id}`} controls autoPlay playsInline className="max-h-[78vh] max-w-full rounded-lg bg-black" />
          ) : a.vista && !fallo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={a.vista} alt={a.nombre_original ?? ""} onError={() => setFallo(true)} className="max-h-[78vh] max-w-full rounded-lg object-contain" />
          ) : (
            <div className="grid max-w-sm place-items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-white/60">
              <ImageIcon className="h-8 w-8" />
              Tu navegador no puede mostrar este formato ({a.nombre_original?.split(".").pop()?.toUpperCase() ?? "foto"}, suele ser HEIC de iPhone). Descárgala con el botón.
            </div>
          )}
        </div>
      </div>
      {a.tipo_archivo === "video" ? (
        <p className="pb-3 text-center text-xs text-white/30" onClick={(e) => e.stopPropagation()}>Si es un .MOV de iPhone puede no verse en algunos navegadores: descárgalo.</p>
      ) : null}
    </div>
  );
}
