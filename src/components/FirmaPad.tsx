"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lienzo para firmar con el dedo o el raton. Devuelve la firma como PNG transparente con tinta oscura (data URL) cuando se levanta
 * el dedo, o null si se borra. `valorInicial` pinta una firma ya guardada.
 */
export function FirmaPad({ onChange, alto = 150, valorInicial = null }: { onChange: (png: string | null) => void; alto?: number; valorInicial?: string | null }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const hayTrazo = useRef(false);

  const preparar = useCallback(() => {
    const c = lienzo.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const ancho = c.parentElement?.clientWidth ?? 320;
    c.width = ancho * ratio;
    c.height = alto * ratio;
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    if (valorInicial) {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min((ancho - 16) / img.width, (alto - 16) / img.height, 1);
        ctx.drawImage(img, (ancho - img.width * escala) / 2, (alto - img.height * escala) / 2, img.width * escala, img.height * escala);
        hayTrazo.current = true;
      };
      img.src = valorInicial;
    }
  }, [alto, valorInicial]);

  useEffect(() => {
    preparar();
  }, [preparar]);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    dibujando.current = true;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01); // un punto suelto tambien cuenta
    ctx.stroke();
    hayTrazo.current = true;
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    const c = lienzo.current;
    if (c && hayTrazo.current) onChange(c.toDataURL("image/png"));
  }

  function borrar() {
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    hayTrazo.current = false;
    onChange(null);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white">
        <canvas ref={lienzo} onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} className="block touch-none cursor-crosshair" aria-label="Zona para firmar" />
        <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-400">Firma aquí con el dedo o el ratón</span>
      </div>
      <button type="button" onClick={borrar} className="mt-1.5 text-xs text-white/50 hover:text-white hover:underline">
        Borrar y firmar otra vez
      </button>
    </div>
  );
}
