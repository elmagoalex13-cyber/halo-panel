"use client";

import { useEffect, useMemo, useState } from "react";
import { SelectorAmbito, ambitoCoincide, type FiltroAmbito } from "@/components/SelectorAmbito";
import { VisorFotos } from "@/components/VisorFotos";
import type { Historia } from "@/lib/historiasIG";

export type ResumenModeloHistorias = {
  modeloId: string;
  nombre: string;
  ambito: string | null;
  foto: number | null;
  total: number;
  nuevas: number;
  ultima: string | null;
};

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Instagram > Historias: las fotos de historias que suben las modelos desde su portal, agrupadas por modelo, con las nuevas marcadas. */
export function HistoriasTab({ resumen: inicial, esDueno }: { resumen: ResumenModeloHistorias[]; esDueno: boolean }) {
  const [resumen, setResumen] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroAmbito>("todas");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Historia[] | null>(null);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Cuantas fotos eran nuevas al abrir (las primeras de la lista, que va de la mas reciente a la mas antigua): se resaltan aunque ya cuenten como vistas
  const [nuevasMarca, setNuevasMarca] = useState(0);
  const [visor, setVisor] = useState<number | null>(null);

  const lista = useMemo(
    () =>
      resumen
        .filter((r) => ambitoCoincide(filtro, r.ambito))
        .sort((a, b) => b.nuevas - a.nuevas || (b.ultima ?? "").localeCompare(a.ultima ?? "")),
    [resumen, filtro],
  );
  const modelo = resumen.find((r) => r.modeloId === abierta) ?? null;

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    setFotos(null);
    setElegidas([]);
    setError(null);
    fetch(`/api/instagram/historias?modelo=${abierta}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { historias?: Historia[]; error?: string };
        if (!vivo) return;
        if (!r.ok) {
          setError(j.error ?? "No se pudieron cargar");
          setFotos([]);
          return;
        }
        setFotos(j.historias ?? []);
        // Abrirlas = verlas: el aviso de esta modelo se quita aqui y en el menú lateral
        setResumen((p) => p.map((x) => (x.modeloId === abierta ? { ...x, nuevas: 0 } : x)));
        window.dispatchEvent(new Event("halo:contadores"));
      })
      .catch(() => {
        if (!vivo) return;
        setError("No se pudieron cargar");
        setFotos([]);
      });
    return () => {
      vivo = false;
    };
  }, [abierta]);

  function abrir(r: ResumenModeloHistorias) {
    setAbierta(r.modeloId);
    setNuevasMarca(r.nuevas);
  }

  const alternar = (key: string) => setElegidas((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  async function borrar() {
    if (!abierta || !elegidas.length || !confirm(`¿Borrar ${elegidas.length} ${elegidas.length === 1 ? "foto" : "fotos"} de ${modelo?.nombre ?? "la modelo"}? Se eliminan del almacenamiento.`)) return;
    setBorrando(true);
    setError(null);
    try {
      const qs = elegidas.map((k) => `key=${encodeURIComponent(k)}`).join("&");
      const r = await fetch(`/api/instagram/historias?modelo=${abierta}&${qs}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo borrar");
      setFotos((p) => (p ?? []).filter((h) => !elegidas.includes(h.key)));
      setResumen((p) => p.map((x) => (x.modeloId === abierta ? { ...x, total: Math.max(0, x.total - elegidas.length) } : x)).filter((x) => x.total > 0 || x.modeloId === abierta));
      setElegidas([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBorrando(false);
    }
  }

  if (!resumen.length) {
    return (
      <p className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/40">
        Todavía no ha subido nadie fotos de historias. Las modelos las suben desde su portal, en la pestaña «Historias IG», y aquí aparecerán con un aviso.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <SelectorAmbito esDueno={esDueno} valor={filtro} onChange={(f) => { setFiltro(f); setAbierta(null); }} cuenta={(f) => resumen.filter((r) => ambitoCoincide(f, r.ambito)).length} />

      <div className="flex flex-wrap gap-2">
        {lista.map((r) => (
          <button
            key={r.modeloId}
            onClick={() => abrir(r)}
            className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition ${
              abierta === r.modeloId ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20" : "border-white/[0.08] bg-white/[0.04] hover:border-white/20"
            }`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[0.12] bg-white/[0.06] text-sm font-semibold text-white/80">
              {r.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/modelos/${r.modeloId}/foto?v=${r.foto}`} alt="" className="h-full w-full object-cover" />
              ) : (
                r.nombre.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                {r.nombre}
                {r.nuevas ? <span className="rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{r.nuevas} {r.nuevas === 1 ? "nueva" : "nuevas"}</span> : null}
              </span>
              <span className="block text-[11px] text-white/40">
                {r.total} {r.total === 1 ? "foto" : "fotos"}
                {r.ultima ? ` · última ${fechaCorta(r.ultima)}` : ""}
              </span>
            </span>
          </button>
        ))}
        {!lista.length ? <p className="text-sm text-white/40">No hay historias de este grupo.</p> : null}
      </div>

      {modelo ? (
        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-white">Historias de {modelo.nombre}</h2>
            {fotos && fotos.length ? (
              <div className="ml-auto flex flex-wrap gap-3 text-xs">
                <button onClick={() => setElegidas(elegidas.length === fotos.length ? [] : fotos.map((h) => h.key))} className="font-semibold text-[#A78BFA] hover:underline">
                  {elegidas.length === fotos.length ? "Quitar selección" : "Seleccionar todas"}
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
          {fotos === null ? <p className="text-sm text-white/40">Cargando…</p> : null}
          {fotos && !fotos.length && !error ? <p className="text-sm text-white/40">No quedan fotos.</p> : null}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
            {(fotos ?? []).map((h, i) => {
              const esNueva = i < nuevasMarca;
              return (
                <div key={h.key} className={`relative overflow-hidden rounded-xl bg-black ring-2 ${elegidas.includes(h.key) ? "ring-emerald-500" : esNueva ? "ring-pink-500/70" : "ring-white/10"}`}>
                  <button type="button" onClick={() => setVisor(i)} aria-label="Ver la foto grande" className="block aspect-[9/16] w-full cursor-zoom-in">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.vista} alt={`Historia ${i + 1} de ${modelo.nombre}`} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternar(h.key)}
                    aria-label="Seleccionar"
                    className={`absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md border text-xs font-bold ${elegidas.includes(h.key) ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/30 bg-black/60 text-transparent hover:text-white/60"}`}
                  >
                    ✓
                  </button>
                  {esNueva ? <span className="absolute right-1.5 top-1.5 rounded-full bg-pink-500 px-1.5 py-0.5 text-[9px] font-bold text-white">NUEVA</span> : null}
                  <div className="flex items-center justify-between gap-1 bg-black/70 px-1.5 py-1 text-[10px] text-white/60">
                    <span>{fechaCorta(h.fecha)}</span>
                    <a href={h.descarga} className="font-semibold text-[#A78BFA] hover:underline" download>
                      Descargar
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/40">Elige una modelo para ver sus fotos.</p>
      )}

      {visor !== null && fotos?.length ? (
        <VisorFotos
          fotos={fotos.map((h) => ({ src: h.vista, pie: fechaCorta(h.fecha), descarga: h.descarga }))}
          indice={Math.min(visor, fotos.length - 1)}
          onCambiar={setVisor}
          onCerrar={() => setVisor(null)}
        />
      ) : null}
    </div>
  );
}
