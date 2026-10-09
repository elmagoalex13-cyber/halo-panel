"use client";

import { useEffect, useState } from "react";
import type { Historia } from "@/lib/historiasIG";

/** Fotos de historias de Instagram que ha subido la modelo desde su portal: verlas, descargarlas tal cual y borrar las ya publicadas. */
export function HistoriasModelo({ modeloId, nombre }: { modeloId: string; nombre: string }) {
  const [historias, setHistorias] = useState<Historia[] | null>(null);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/modelos/${modeloId}/historias`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { historias?: Historia[]; error?: string };
        if (!vivo) return;
        if (!r.ok) setError(j.error ?? "No se pudieron cargar");
        setHistorias(j.historias ?? []);
      })
      .catch(() => {
        if (!vivo) return;
        setError("No se pudieron cargar");
        setHistorias([]);
      });
    return () => {
      vivo = false;
    };
  }, [modeloId]);

  const alternar = (key: string) => setElegidas((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  async function borrar() {
    if (!elegidas.length || !confirm(`¿Borrar ${elegidas.length} ${elegidas.length === 1 ? "foto" : "fotos"} de historias de ${nombre}? Se eliminan del almacenamiento.`)) return;
    setBorrando(true);
    setError(null);
    try {
      const qs = elegidas.map((k) => `key=${encodeURIComponent(k)}`).join("&");
      const r = await fetch(`/api/modelos/${modeloId}/historias?${qs}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo borrar");
      setHistorias((p) => (p ?? []).filter((h) => !elegidas.includes(h.key)));
      setElegidas([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBorrando(false);
    }
  }

  if (historias === null) return <p className="text-sm text-halo-subtle">Cargando…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-halo-subtle">
          {historias.length
            ? `${historias.length} ${historias.length === 1 ? "foto" : "fotos"} de historias subidas por ${nombre} desde su portal.`
            : `${nombre} todavía no ha subido fotos de historias. Las sube desde su portal, en «Historias IG».`}
        </p>
        {historias.length ? (
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <button onClick={() => setElegidas(elegidas.length === historias.length ? [] : historias.map((h) => h.key))} className="font-semibold text-[#A78BFA] hover:underline">
              {elegidas.length === historias.length ? "Quitar selección" : "Seleccionar todas"}
            </button>
            {elegidas.length ? (
              <button onClick={borrar} disabled={borrando} className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-1.5 font-semibold text-red-400 hover:bg-red-950/50 disabled:opacity-50">
                {borrando ? "Borrando…" : `Borrar ${elegidas.length} (ya publicadas)`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        {historias.map((h, i) => (
          <div key={h.key} className={`relative overflow-hidden rounded-xl bg-black ring-2 ${elegidas.includes(h.key) ? "ring-emerald-500" : "ring-white/10"}`}>
            <a href={h.vista} target="_blank" rel="noopener noreferrer" className="block aspect-[9/16]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.vista} alt={`Historia ${i + 1} de ${nombre}`} loading="lazy" className="h-full w-full object-cover" />
            </a>
            <button
              type="button"
              onClick={() => alternar(h.key)}
              aria-label="Seleccionar"
              className={`absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md border text-xs font-bold ${elegidas.includes(h.key) ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/30 bg-black/60 text-transparent hover:text-white/60"}`}
            >
              ✓
            </button>
            <div className="flex items-center justify-between gap-1 bg-black/70 px-1.5 py-1 text-[10px] text-white/60">
              <span>{h.fecha ? new Date(h.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : ""}</span>
              <a href={h.descarga} className="font-semibold text-[#A78BFA] hover:underline" download>
                Descargar
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
