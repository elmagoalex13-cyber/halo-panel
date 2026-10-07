"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

/**
 * Doble confirmación para borrar algo PARA SIEMPRE:
 *  1.º paso: se explica qué se va a perder y hay que pulsar «Continuar».
 *  2.º paso: hay que escribir el nombre exacto de lo que se borra para activar el botón rojo.
 */
export function ConfirmacionDoble({
  abierto,
  titulo,
  detalle,
  nombre,
  etiquetaFinal = "Eliminar para siempre",
  ocupado = false,
  error,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  detalle: string;
  nombre: string;
  etiquetaFinal?: string;
  ocupado?: boolean;
  error?: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (abierto) {
      setPaso(1);
      setTexto("");
    }
  }, [abierto]);

  if (!abierto) return null;
  const coincide = texto.trim().toLowerCase() === nombre.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#14101c] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-300">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300/80">Confirmación {paso} de 2</p>
            <h2 className="font-display text-lg font-semibold text-white">{titulo}</h2>
          </div>
        </div>

        {paso === 1 ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-white/65">{detalle}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onCancelar} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={() => setPaso(2)} className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/25">
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Esto <span className="font-semibold text-red-300">no se puede deshacer</span>. Para confirmar, escribe el nombre exacto:
            </p>
            <p className="mt-2 rounded-lg bg-black/30 px-3 py-2 font-mono text-sm text-white">{nombre}</p>
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe el nombre aquí"
              className="input-base mt-3 w-full"
            />
            {error ? <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onCancelar} disabled={ocupado} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button
                onClick={onConfirmar}
                disabled={!coincide || ocupado}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {etiquetaFinal}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
