"use client";

import { useState } from "react";
import { VisorFotos, type FotoVisor } from "@/components/VisorFotos";
import type { FotoPerfilVista, FotosPerfilVistas, TipoFotoPerfil } from "@/lib/fotosPerfil";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
const tamano = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const TITULO: Record<TipoFotoPerfil, string> = { perfil: "Perfil", banner: "Banner" };

/**
 * Foto de perfil y banner de UNA modelo, con lo que se puede hacer con ellas: verlas en grande (dentro de la app), descargarlas, marcarlas como
 * publicadas en OnlyFans, eliminarlas o pedirle a la modelo que las suba de nuevo (con un motivo).
 */
export function FotosPerfilModelo({ modeloId, fotos, onCambio }: { modeloId: string; fotos: FotosPerfilVistas; onCambio: (f: FotosPerfilVistas) => void }) {
  const [ocupado, setOcupado] = useState<TipoFotoPerfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visor, setVisor] = useState<number | null>(null);

  const visibles = (["perfil", "banner"] as TipoFotoPerfil[]).filter((t) => fotos[t]);
  const itemsVisor: FotoVisor[] = visibles.map((t) => ({ src: fotos[t]!.vista, descarga: fotos[t]!.descarga, pie: TITULO[t] }));

  async function accion(tipo: TipoFotoPerfil, a: "publicada" | "no_publicada" | "eliminar" | "repetir", motivo?: string) {
    setOcupado(tipo);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/fotos-perfil`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, accion: a, motivo }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; fotos?: FotosPerfilVistas };
      if (!res.ok || !j.fotos) throw new Error(j.error ?? "No se pudo guardar");
      onCambio(j.fotos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(null);
    }
  }

  function eliminar(tipo: TipoFotoPerfil) {
    if (!window.confirm(`¿Eliminar la foto de ${tipo === "perfil" ? "perfil" : "banner"}? Se borra para siempre.`)) return;
    void accion(tipo, "eliminar");
  }
  function repetir(tipo: TipoFotoPerfil) {
    const motivo = window.prompt("Se borra esta foto y la modelo tendrá que subir otra. ¿Qué tiene que mejorar? (opcional, lo verá en su portal)", "");
    if (motivo === null) return;
    void accion(tipo, "repetir", motivo);
  }

  const bloque = (tipo: TipoFotoPerfil, clase: string) => {
    const f: FotoPerfilVista | null = fotos[tipo];
    const pedida = fotos.pedir[tipo];
    return (
      <div className="min-w-0 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{TITULO[tipo]}</p>
        {f ? (
          <>
            <button type="button" onClick={() => setVisor(visibles.indexOf(tipo))} title="Ver en grande" className={`relative block cursor-zoom-in overflow-hidden rounded-lg border border-white/10 bg-black/30 ${clase}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.vista} alt={TITULO[tipo]} loading="lazy" className="h-full w-full object-cover" />
              {f.publicada_at ? <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">✓ Publicada</span> : null}
            </button>
            <p className="text-[11px] text-white/40">
              Subida el {fecha(f.at)} · {tamano(f.size)}
              {f.publicada_at ? ` · publicada el ${fecha(f.publicada_at)}${f.publicada_por ? ` (${f.publicada_por})` : ""}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <button
                disabled={ocupado === tipo}
                onClick={() => void accion(tipo, f.publicada_at ? "no_publicada" : "publicada")}
                className={`rounded-lg border px-2 py-1 transition disabled:opacity-40 ${f.publicada_at ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"}`}
              >
                {f.publicada_at ? "✓ Publicada (deshacer)" : "Marcar publicada"}
              </button>
              <a href={f.descarga} className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-white/60 transition hover:text-white">Descargar</a>
              <button disabled={ocupado === tipo} onClick={() => repetir(tipo)} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-40">Pedir otra</button>
              <button disabled={ocupado === tipo} onClick={() => eliminar(tipo)} className="rounded-lg border border-red-900/50 bg-red-950/40 px-2 py-1 text-red-300 transition hover:bg-red-950/70 disabled:opacity-40">Eliminar</button>
            </div>
          </>
        ) : (
          <>
            <div className={`grid place-items-center rounded-lg border border-dashed border-white/10 px-2 text-center text-xs text-white/30 ${clase}`}>{pedida ? "Pedida de nuevo" : "Pendiente de subir"}</div>
            {pedida ? (
              <p className="text-[11px] text-amber-200/80">
                Le pediste otra el {fecha(pedida.at)}
                {pedida.motivo ? `: «${pedida.motivo}»` : ""}
              </p>
            ) : null}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-[6.5rem_1fr] gap-3">
        {bloque("perfil", "aspect-[3/4] w-[6.5rem]")}
        {bloque("banner", "aspect-[4/3] w-full max-w-[13rem]")}
      </div>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {visor !== null ? <VisorFotos fotos={itemsVisor} indice={visor} onCambiar={setVisor} onCerrar={() => setVisor(null)} /> : null}
    </>
  );
}
