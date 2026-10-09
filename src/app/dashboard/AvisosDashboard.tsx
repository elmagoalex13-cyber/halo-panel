"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type Aviso = { id?: string; nivel: "rojo" | "amarillo" | "verde"; texto: string; href?: string };

const CLAVE = "halo:avisos-ocultos";

const COLORES = {
  rojo: "border-red-500/40 bg-red-950/30 text-red-300",
  amarillo: "border-amber-500/40 bg-amber-950/30 text-amber-300",
  verde: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
} as const;
const PUNTOS = { rojo: "bg-red-400", amarillo: "bg-amber-400", verde: "bg-emerald-400" } as const;

function leerOcultos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const DIAS_OCULTO = 7; // un aviso quitado no vuelve en 7 dias; si el problema sigue pasado ese tiempo, se vuelve a avisar

// Los avisos se calculan solos a partir de los datos; aqui se pueden ocultar a mano. Cada aviso tiene una identidad estable
// (que es, y de que modelos) que NO depende de numeros ni de "ayer/hoy": asi quitarlo lo quita de verdad. Solo vuelve a salir
// si es otro aviso (otra modelo, otro dia de actividad) o pasan 7 dias. Se guarda en el servidor (vale en todos tus dispositivos).
export function AvisosDashboard({ avisos }: { avisos: Aviso[] }) {
  const [ocultos, setOcultos] = useState<Record<string, string> | null>(null); // id -> cuando se quito
  const [antiguos, setAntiguos] = useState<string[]>([]); // claves de la version anterior (texto), solo en este navegador

  useEffect(() => {
    setAntiguos(leerOcultos());
    let vivo = true;
    fetch("/api/panel/avisos-ocultos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ocultos: {} }))
      .then((j: { ocultos?: Record<string, string> }) => vivo && setOcultos(j.ocultos ?? {}))
      .catch(() => vivo && setOcultos({}));
    return () => {
      vivo = false;
    };
  }, []);

  const clave = (a: Aviso) => a.id ?? `${a.nivel}|${a.texto}`;
  const limite = Date.now() - DIAS_OCULTO * 86400000;
  const estaOculto = (a: Aviso) => {
    const cuando = ocultos?.[clave(a)];
    return (cuando && new Date(cuando).getTime() >= limite) || antiguos.includes(`${a.nivel}|${a.texto}`);
  };

  async function cambiar(ids: string[], ocultar: boolean) {
    const ahora = new Date().toISOString();
    setOcultos((p) => {
      const n = { ...(p ?? {}) };
      for (const id of ids) {
        if (ocultar) n[id] = ahora;
        else delete n[id];
      }
      return n;
    });
    if (!ocultar) setAntiguos([]); // al mostrar todo se olvida tambien lo que se habia quitado con el sistema antiguo
    try {
      if (!ocultar) localStorage.removeItem(CLAVE);
      await fetch("/api/panel/avisos-ocultos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ocultar ? { ocultar: ids } : { mostrar: ids }) });
    } catch {
      /* si falla el guardado, queda oculto hasta recargar */
    }
  }

  if (ocultos === null) return null;
  const visibles = avisos.filter((a) => !estaOculto(a));
  const escondidos = avisos.length - visibles.length;
  if (!avisos.length) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {visibles.map((a) => {
        const contenido = (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTOS[a.nivel]}`} />
            <span className="flex-1">{a.texto}</span>
            {a.href ? <span className="text-xs opacity-60">Ver &rarr;</span> : null}
          </>
        );
        return (
          <div key={clave(a)} className={`flex items-center gap-1 rounded-xl border text-sm ${COLORES[a.nivel]}`}>
            {a.href ? (
              <a href={a.href} className="flex flex-1 items-center gap-3 px-4 py-2.5">
                {contenido}
              </a>
            ) : (
              <div className="flex flex-1 items-center gap-3 px-4 py-2.5">{contenido}</div>
            )}
            <button
              onClick={() => void cambiar([clave(a)], true)}
              title="Quitar este aviso"
              aria-label="Quitar este aviso"
              className="mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg opacity-60 transition hover:bg-white/10 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {escondidos > 0 ? (
        <button
          onClick={() => void cambiar(avisos.filter(estaOculto).map(clave), false)}
          className="w-fit text-xs text-white/40 hover:text-white/70 hover:underline"
        >
          Mostrar {escondidos} aviso{escondidos === 1 ? "" : "s"} oculto{escondidos === 1 ? "" : "s"}
        </button>
      ) : null}
    </div>
  );
}
