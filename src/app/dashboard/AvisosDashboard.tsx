"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type Aviso = { nivel: "rojo" | "amarillo" | "verde"; texto: string; href?: string };

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

// Los avisos se calculan solos a partir de los datos; aqui se pueden ocultar a mano. Se recuerda en este
// navegador. Si el aviso cambia (otro numero, otra cuenta) vuelve a salir porque es un aviso distinto.
export function AvisosDashboard({ avisos }: { avisos: Aviso[] }) {
  const [ocultos, setOcultos] = useState<string[] | null>(null);

  useEffect(() => setOcultos(leerOcultos()), []);

  function guardar(siguiente: string[]) {
    setOcultos(siguiente);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(siguiente.slice(-200)));
    } catch {
      /* sin almacenamiento: se oculta solo hasta recargar */
    }
  }

  if (ocultos === null) return null;
  const clave = (a: Aviso) => `${a.nivel}|${a.texto}`;
  const visibles = avisos.filter((a) => !ocultos.includes(clave(a)));
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
              onClick={() => guardar([...ocultos, clave(a)])}
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
          onClick={() => guardar(ocultos.filter((o) => !avisos.some((a) => clave(a) === o)))}
          className="w-fit text-xs text-white/40 hover:text-white/70 hover:underline"
        >
          Mostrar {escondidos} aviso{escondidos === 1 ? "" : "s"} oculto{escondidos === 1 ? "" : "s"}
        </button>
      ) : null}
    </div>
  );
}
