"use client";

import { Layers, User, Users } from "lucide-react";

export type FiltroAmbito = "todas" | "mias" | "compartidas";

/** ¿Encaja esta modelo en el filtro? (sin ambito conocido = privada) */
export const ambitoCoincide = (filtro: FiltroAmbito, ambito: string | null | undefined) =>
  filtro === "todas" || (filtro === "compartidas" ? ambito === "compartido" : ambito !== "compartido");

const OPCIONES: Array<{ id: FiltroAmbito; etiqueta: string; Icono: typeof Layers; activo: string; icono: string; ayuda: string }> = [
  { id: "todas", etiqueta: "Todo", Icono: Layers, activo: "bg-white/15 text-white ring-1 ring-white/25", icono: "text-white/60", ayuda: "Viendo todo: lo tuyo y lo de tu socio" },
  { id: "mias", etiqueta: "Mis modelos", Icono: User, activo: "bg-violet-500/30 text-violet-100 ring-1 ring-violet-400/60", icono: "text-violet-300", ayuda: "Solo lo tuyo: tu socio no ve nada de esto" },
  { id: "compartidas", etiqueta: "Con mi socio", Icono: Users, activo: "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/60", icono: "text-cyan-300", ayuda: "Lo compartido: esto es justo lo que ve tu socio" },
];

/** Selector grande y de colores: violeta = mío, turquesa = compartido con el socio. Solo se pinta para el dueño. */
export function SelectorAmbito({
  esDueno,
  valor,
  onChange,
  cuenta,
  ocupado = false,
}: {
  ocupado?: boolean;
  esDueno: boolean;
  valor: FiltroAmbito;
  onChange: (f: FiltroAmbito) => void;
  cuenta: (f: FiltroAmbito) => number;
}) {
  if (!esDueno) return null;
  const actual = OPCIONES.find((o) => o.id === valor) ?? OPCIONES[0];
  return (
    <div className="mb-4">
      <div className={`inline-flex transition-opacity ${ocupado ? "opacity-60" : ""} max-w-full flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1`}>
        {OPCIONES.map(({ id, etiqueta, Icono, activo, icono }) => {
          const on = valor === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${on ? activo : "text-white/50 hover:bg-white/[0.05] hover:text-white/80"}`}
            >
              <Icono className={`h-4 w-4 ${on ? "" : icono}`} />
              {etiqueta}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${on ? "bg-black/25" : "bg-white/10"}`}>{cuenta(id)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-white/40">{ocupado ? "Cargando…" : actual.ayuda}</p>
    </div>
  );
}

/** Puntito de color junto al nombre de una modelo: violeta = mía, turquesa = compartida. */
export function PuntoAmbito({ ambito }: { ambito: string | null | undefined }) {
  const compartida = ambito === "compartido";
  return (
    <span
      title={compartida ? "Compartida con tu socio" : "Solo tuya"}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${compartida ? "bg-cyan-400" : "bg-violet-400"}`}
    />
  );
}
