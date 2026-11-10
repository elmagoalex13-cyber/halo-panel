"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";

/** Interruptor de los «videos de bienvenida»: al firmar el contrato, una modelo nueva recibe los ultimos 40 videos asignados a las demas (solo el dueño). */
export function BienvenidaPanel() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/ajustes/bienvenida", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { activo?: boolean } | null) => setActivo(j ? j.activo !== false : null))
      .catch(() => undefined);
  }, []);

  async function cambiar(nuevo: boolean) {
    const antes = activo;
    setActivo(nuevo);
    setError(null);
    const r = await fetch("/api/ajustes/bienvenida", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: nuevo }) });
    if (!r.ok) {
      setActivo(antes);
      setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo guardar");
    }
  }

  if (activo === null) return null;
  return (
    <GlassCard className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <h2 className="font-display text-lg font-semibold text-white">Vídeos de bienvenida al firmar el contrato</h2>
          <p className="mt-1 text-sm text-white/50">
            {activo
              ? "Activado: una hora después de firmar, una modelo nueva recibe en su portal los últimos 40 vídeos asignados a las demás (una sola vez)."
              : "Desactivado: las modelos nuevas NO reciben ningún vídeo al firmar. Se los asignas tú."}
          </p>
          <p className="mt-1 text-xs text-white/35">Solo afecta a los contratos que se firmen a partir de ahora. Lo ya asignado no se toca.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          onClick={() => void cambiar(!activo)}
          className={`relative h-7 w-14 shrink-0 rounded-full border transition ${activo ? "border-[#8B5CF6] bg-[#8B5CF6]/60" : "border-white/20 bg-white/10"}`}
        >
          <span className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white transition-all ${activo ? "left-[1.9rem]" : "left-0.5"}`} style={{ height: "1.375rem", width: "1.375rem" }} />
          <span className="sr-only">{activo ? "Desactivar" : "Activar"}</span>
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </GlassCard>
  );
}
