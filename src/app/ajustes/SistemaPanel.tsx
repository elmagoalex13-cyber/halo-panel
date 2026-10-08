"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";

type Latido = { at: string; maquina: string; pendientes: number; procesando: number; errores: number; espera_mas_antigua: string | null; trabajadores: number };
type Estado = {
  tablaLista: boolean;
  retencionDias: number;
  retencionActiva: boolean;
  runners: Latido[];
  limpieza: { at: string; borrados: number } | null;
  backup: { at: string; dia: string; tablas: number } | null;
};

const hace = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

/** Estado del editor de vídeo y limpieza automática de originales (solo el dueño). */
export function SistemaPanel() {
  const [e, setE] = useState<Estado | null>(null);
  const [dias, setDias] = useState("60");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function cargar() {
    try {
      const r = await fetch("/api/panel/sistema", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Estado;
      setE(j);
      setDias(String(j.retencionDias));
    } catch {
      /* sin red: se queda como esta */
    }
  }
  useEffect(() => {
    void cargar();
    const t = window.setInterval(cargar, 30000);
    return () => window.clearInterval(t);
  }, []);

  async function guardar() {
    setGuardando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/panel/sistema", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retencion_dias: Number(dias) }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(r.ok ? { ok: true, texto: "Guardado" } : { ok: false, texto: j.error ?? "No se pudo guardar" });
      if (r.ok) await cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (!e) return null;
  const enLinea = (l: Latido) => Date.now() - new Date(l.at).getTime() < 4 * 60000;

  return (
    <GlassCard className="space-y-5 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">Sistema</h2>
        <p className="mt-1 text-sm text-white/55">Estado del editor de vídeo y limpieza automática del almacenamiento.</p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35">Editor de vídeo</p>
        {!e.tablaLista ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">Falta ejecutar el SQL <code>20261019_escala.sql</code> en Supabase para ver el estado y guardar ajustes.</p>
        ) : e.runners.length === 0 ? (
          <p className="text-sm text-white/45">Aún no se ha recibido ninguna señal del editor.</p>
        ) : (
          e.runners.map((r) => (
            <div key={r.maquina} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm">
              <span className={`flex items-center gap-2 font-semibold ${enLinea(r) ? "text-emerald-300" : "text-red-300"}`}>
                <span className={`h-2 w-2 rounded-full ${enLinea(r) ? "bg-emerald-400" : "bg-red-400"}`} />
                {enLinea(r) ? "En línea" : "Sin respuesta"}
              </span>
              <span className="text-white/70">{r.maquina}</span>
              <span className="text-white/45">
                {r.procesando} editando · {r.pendientes} en cola · {r.errores} con error · último latido {hace(r.at)}
              </span>
              {r.pendientes > 0 && r.espera_mas_antigua ? <span className="text-white/45">el más antiguo espera desde {hace(r.espera_mas_antigua)}</span> : null}
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35">Borrado automático de originales</p>
        <p className="text-sm leading-relaxed text-white/55">
          Cada noche se borra el vídeo <span className="text-white/80">original</span> (tal como lo grabó la modelo) de los reels publicados o descartados hace más de estos días. Los vídeos
          editados y todo lo demás se conservan. Los originales también se pueden borrar a mano en «Originales».
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min={0} max={730} value={dias} onChange={(ev) => setDias(ev.target.value)} className="input-base w-24 py-1.5 text-sm" />
          <span className="text-sm text-white/55">días (0 = no borrar nunca)</span>
          <button onClick={guardar} disabled={guardando || !e.tablaLista} className="btn-primary px-4 py-1.5 text-sm disabled:opacity-40">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</span> : null}
        </div>
        {!e.retencionActiva ? <p className="text-xs text-amber-300">Todavía no está activado: elige los días y pulsa Guardar. Hasta entonces no se borra nada solo.</p> : null}
        <p className="text-xs text-white/40">
          Última limpieza: {e.limpieza ? `${hace(e.limpieza.at)} · ${e.limpieza.borrados} originales borrados` : "aún no se ha ejecutado"}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35">Copia de seguridad de la base de datos</p>
        <p className="text-sm text-white/55">
          {e.backup ? `Última copia: ${e.backup.dia} (${e.backup.tablas} tablas, ${hace(e.backup.at)}). Se hace cada noche y se guarda en el servidor y en un almacén privado.` : "Todavía no hay ninguna copia (se hace cada noche a partir de las 03:00 UTC)."}
        </p>
      </div>
    </GlassCard>
  );
}
