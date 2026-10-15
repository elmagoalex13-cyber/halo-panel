"use client";

import { useState } from "react";
import type { EstadoEspejo } from "@/lib/espejoVideos";

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "");

/** Vídeos de bienvenida: una sola vez, una hora despues de firmar, se le asignan los ultimos 40 videos asignados a las demas modelos. Aqui se ve y se puede adelantar o cancelar. */
export function EspejoVideos({ modeloId, inicial }: { modeloId: string; inicial: EstadoEspejo }) {
  const [estado, setEstado] = useState<EstadoEspejo>(inicial);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function accion(a: "programar" | "ahora" | "cancelar") {
    setTrabajando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/espejo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: a }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string } & EstadoEspejo;
      if (!res.ok) throw new Error(j.error ?? "No se pudo cambiar");
      setEstado({ estado: j.estado, due: j.due, hecho_at: j.hecho_at, n: j.n });
      if (a === "ahora") setMsg("Hecho: en unos minutos tendrá en su portal los últimos 40 vídeos asignados a las demás.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setTrabajando(false);
    }
  }

  const boton = "rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-halo-text hover:bg-white/[0.08] disabled:opacity-50";
  return (
    <div className="card !p-4">
      <p className="text-sm font-semibold text-halo-text">🎬 Vídeos de bienvenida</p>
      <p className="mt-0.5 text-xs text-halo-subtle">Una sola vez, se le asignan en su portal los últimos 40 vídeos que se hayan asignado a las demás. Lo que se asigne después a otras no le llega.</p>
      {estado.estado === "pendiente" ? (
        <>
          <p className="mt-2 text-xs text-amber-200">⏳ Pendiente: se le asignarán a partir de las {hora(estado.due)} (una hora después de firmar).</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button disabled={trabajando} onClick={() => void accion("ahora")} className={boton}>Asignárselos ya</button>
            <button disabled={trabajando} onClick={() => void accion("cancelar")} className={boton}>Cancelar</button>
          </div>
        </>
      ) : estado.estado === "hecho" ? (
        <>
          <p className="mt-2 text-xs text-emerald-300">✓ Hecho el {hora(estado.hecho_at ?? undefined)}{typeof estado.n === "number" ? `: se le asignaron ${estado.n} vídeos` : ""}.</p>
          <div className="mt-2">
            <button disabled={trabajando} onClick={() => void accion("ahora")} className={boton}>Volver a asignarle los últimos 40</button>
          </div>
        </>
      ) : (
        <div className="mt-2">
          <button disabled={trabajando} onClick={() => void accion("ahora")} className={boton}>Asignarle los últimos 40 ahora</button>
        </div>
      )}
      {msg ? <p className="mt-2 text-xs text-halo-subtle">{msg}</p> : null}
    </div>
  );
}
