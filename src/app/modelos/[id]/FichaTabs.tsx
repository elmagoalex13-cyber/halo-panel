"use client";

import { useEffect, useState, type ReactNode } from "react";

export type Pestana = {
  id: string;
  label: string;
  icono: string;
  aviso?: string | null; // punto/etiqueta pequena junto al nombre
  contenido: ReactNode;
};

// Pestanas con el id en el hash (#onboarding): los enlaces del dashboard abren la pestana directa.
// Todos los paneles se renderizan (solo se ocultan) para no perder estado ni el scroll interno.
export function FichaTabs({ pestanas, inicial }: { pestanas: Pestana[]; inicial: string }) {
  const [activa, setActiva] = useState(inicial);

  useEffect(() => {
    function desdeHash() {
      const h = window.location.hash.replace("#", "");
      if (pestanas.some((p) => p.id === h)) setActiva(h);
    }
    desdeHash();
    window.addEventListener("hashchange", desdeHash);
    return () => window.removeEventListener("hashchange", desdeHash);
  }, [pestanas]);

  function elegir(id: string) {
    setActiva(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Secciones de la ficha"
        className="sticky top-0 z-20 -mx-1 mb-5 flex gap-1.5 overflow-x-auto bg-[#060509]/85 px-1 py-2 backdrop-blur-xl [scrollbar-width:none]"
      >
        {pestanas.map((p) => {
          const on = p.id === activa;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => elegir(p.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                on
                  ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                  : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80"
              }`}
            >
              <span aria-hidden="true">{p.icono}</span>
              {p.label}
              {p.aviso ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? "bg-white/20 text-white" : "bg-amber-400/90 text-black"}`}>{p.aviso}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {pestanas.map((p) => (
        <div key={p.id} id={p.id} role="tabpanel" hidden={p.id !== activa} className="scroll-mt-16">
          {p.contenido}
        </div>
      ))}
    </div>
  );
}
