"use client";

import { useCallback, useEffect } from "react";

export type FotoVisor = { src: string; pie?: string; descarga?: string };

/** Visor de fotos a pantalla completa dentro de la propia página: flechas / teclas ← → para pasar, Esc o clic fuera para cerrar. */
export function VisorFotos({ fotos, indice, onCambiar, onCerrar }: { fotos: FotoVisor[]; indice: number; onCambiar: (i: number) => void; onCerrar: () => void }) {
  const foto = fotos[indice];
  const anterior = useCallback(() => onCambiar((indice - 1 + fotos.length) % fotos.length), [indice, fotos.length, onCambiar]);
  const siguiente = useCallback(() => onCambiar((indice + 1) % fotos.length), [indice, fotos.length, onCambiar]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === "ArrowRight") siguiente();
    }
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [anterior, siguiente, onCerrar]);

  if (!foto) return null;
  const boton = "grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lg text-white backdrop-blur transition hover:bg-white/25";
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Foto" onClick={onCerrar}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
        <span>
          {indice + 1} / {fotos.length}
          {foto.pie ? ` · ${foto.pie}` : ""}
        </span>
        <div className="flex items-center gap-2">
          {foto.descarga ? (
            <a href={foto.descarga} download className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/25">
              Descargar
            </a>
          ) : null}
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className={boton}>
            ✕
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto.src} alt={foto.pie ?? "Foto"} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        {fotos.length > 1 ? (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); anterior(); }} aria-label="Anterior" className={`${boton} absolute left-3 top-1/2 -translate-y-1/2`}>
              ‹
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); siguiente(); }} aria-label="Siguiente" className={`${boton} absolute right-3 top-1/2 -translate-y-1/2`}>
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
