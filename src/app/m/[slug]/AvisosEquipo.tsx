"use client";

import { useEffect, useState } from "react";

type Aviso = { id: string; items: Array<{ tipo: string; cantidad?: number }>; texto: string | null; created_at: string };

const ETQ: Record<string, string> = { reels: "🎬 Reels", script: "📝 Scripts completos", pack: "📦 Packs de fotos", post: "🖼 Posts de OnlyFans", otro: "✨ Otro contenido" };
const CLAVE = "halo:avisos-equipo-vistos";

const leerVistos = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Avisos que el equipo le ha enviado ("necesitamos ..."): arriba del portal hasta que ella los marca como vistos (se recuerda en este móvil). */
export function AvisosEquipo({ avisos }: { avisos: Aviso[] }) {
  const [vistos, setVistos] = useState<string[] | null>(null);
  useEffect(() => setVistos(leerVistos()), []);
  if (vistos === null) return null;
  const pendientes = avisos.filter((a) => !vistos.includes(a.id));
  if (!pendientes.length) return null;

  function marcar(id: string) {
    const nuevos = [...vistos!, id].slice(-100);
    setVistos(nuevos);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(nuevos));
    } catch {
      /* sin almacenamiento: se oculta hasta recargar */
    }
  }

  return (
    <section className="space-y-2">
      {pendientes.map((a) => (
        <div key={a.id} className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-base font-semibold text-amber-100">📣 El equipo necesita contenido tuyo</p>
            <button type="button" onClick={() => marcar(a.id)} className="shrink-0 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/70 hover:text-white">
              Visto
            </button>
          </div>
          {a.items.length ? (
            <ul className="mt-2 space-y-1 text-sm text-white/85">
              {a.items.map((i) => (
                <li key={i.tipo}>
                  • {i.cantidad ? `${i.cantidad} ` : ""}
                  {ETQ[i.tipo] ?? i.tipo}
                </li>
              ))}
            </ul>
          ) : null}
          {a.texto ? <p className="mt-2 rounded-xl bg-black/20 px-3 py-2 text-sm leading-relaxed text-white/80">💬 {a.texto}</p> : null}
          {a.items.some((i) => ["script", "pack", "post"].includes(i.tipo)) ? <p className="mt-2 text-xs text-white/50">Para el contenido de OnlyFans sigue la pestaña «Guía OnlyFans», tal cual.</p> : null}
          <p className="mt-2 text-[11px] text-white/35">{new Date(a.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      ))}
    </section>
  );
}
