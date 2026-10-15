"use client";

import { useState } from "react";

/** Interruptor «Vídeos al día»: si esta activo, la modelo recibe sola en su portal los ultimos 40 videos asignados a las demas y cada video nuevo que se asigne. */
export function EspejoVideos({ modeloId, activo: inicial }: { modeloId: string; activo: boolean }) {
  const [activo, setActivo] = useState(inicial);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function cambiar(valor: boolean) {
    setTrabajando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/espejo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: valor }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo cambiar");
      setActivo(valor);
      setMsg(valor ? "Hecho: en un minuto tendrá en su portal los últimos 40 vídeos asignados a las demás." : null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="card !p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={activo} disabled={trabajando} onChange={(e) => void cambiar(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#8B5CF6]" />
        <span>
          <span className="block text-sm font-semibold text-halo-text">🎬 Vídeos al día</span>
          <span className="block text-xs text-halo-subtle">
            Recibe sola en su portal los últimos 40 vídeos que se han asignado a las demás y, a partir de ahí, cada vídeo nuevo que se les asigne. No se le quita nada de lo que ya tenga.
          </span>
        </span>
      </label>
      {msg ? <p className="mt-2 text-xs text-halo-subtle">{msg}</p> : null}
    </div>
  );
}
