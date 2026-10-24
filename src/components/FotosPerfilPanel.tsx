"use client";

import { useState } from "react";
import { VisorFotos, type FotoVisor } from "@/components/VisorFotos";
import type { FotoPerfilVista, FotosPerfilVistas, TipoFotoPerfil } from "@/lib/fotosPerfil";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
const tamano = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const TITULO: Record<TipoFotoPerfil, string> = { perfil: "Perfil", banner: "Banner" };

/**
 * Foto de perfil y banner de UNA modelo: TODAS las opciones que ha subido (la mas reciente primero), cada una con sus acciones: verla en grande (dentro de la app),
 * descargarla, marcarla como publicada en OnlyFans, eliminarla o pedirle a la modelo que suba otra (con un motivo).
 */
export function FotosPerfilModelo({ modeloId, fotos, onCambio }: { modeloId: string; fotos: FotosPerfilVistas; onCambio: (f: FotosPerfilVistas) => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visor, setVisor] = useState<number | null>(null);

  // Todas las fotos, en el orden del visor (perfiles y luego banners)
  const todas = [...fotos.perfilOpciones.map((f) => ({ tipo: "perfil" as const, f })), ...fotos.bannerOpciones.map((f) => ({ tipo: "banner" as const, f }))];
  const itemsVisor: FotoVisor[] = todas.map(({ tipo, f }) => ({ src: f.vista, descarga: f.descarga, pie: `${TITULO[tipo]} · ${fecha(f.at)}` }));

  async function accion(tipo: TipoFotoPerfil, key: string, a: "publicada" | "no_publicada" | "eliminar" | "repetir", motivo?: string) {
    setOcupado(key);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/fotos-perfil`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, key, accion: a, motivo }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; fotos?: FotosPerfilVistas };
      if (!res.ok || !j.fotos) throw new Error(j.error ?? "No se pudo guardar");
      onCambio(j.fotos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(null);
    }
  }

  function eliminar(tipo: TipoFotoPerfil, key: string) {
    if (!window.confirm(`¿Eliminar esta foto de ${tipo === "perfil" ? "perfil" : "banner"}? Se borra para siempre.`)) return;
    void accion(tipo, key, "eliminar");
  }
  function repetir(tipo: TipoFotoPerfil, key: string) {
    const motivo = window.prompt("Se borra esta foto y la modelo tendrá que subir otra. ¿Qué tiene que mejorar? (opcional, lo verá en su portal)", "");
    if (motivo === null) return;
    void accion(tipo, key, "repetir", motivo);
  }

  const seccion = (tipo: TipoFotoPerfil, opciones: FotoPerfilVista[], clase: string) => {
    const pedida = fotos.pedir[tipo];
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          {TITULO[tipo]}
          {opciones.length > 1 ? <span className="ml-1.5 rounded-full bg-[#8B5CF6]/25 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[#C4B5FD]">{opciones.length} opciones</span> : null}
        </p>
        {opciones.length ? (
          <div className="flex flex-wrap gap-3">
            {opciones.map((f, i) => {
              const ocup = ocupado === f.key;
              return (
                <div key={f.key} className="w-fit max-w-full space-y-1.5">
                  <button type="button" onClick={() => setVisor(todas.findIndex((x) => x.f.key === f.key))} title="Ver en grande" className={`relative block cursor-zoom-in overflow-hidden rounded-lg border border-white/10 bg-black/30 ${clase}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.vista} alt={TITULO[tipo]} loading="lazy" className="h-full w-full object-cover" />
                    {f.publicada_at ? <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">✓ Publicada</span> : null}
                    {i === 0 && opciones.length > 1 ? <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#8B5CF6] px-2 py-0.5 text-[10px] font-bold text-white">Última subida</span> : null}
                  </button>
                  <p className="text-[11px] text-white/40">
                    {fecha(f.at)} · {tamano(f.size)}
                    {f.publicada_at ? ` · publicada${f.publicada_por ? ` (${f.publicada_por})` : ""}` : ""}
                  </p>
                  <div className="flex max-w-[16rem] flex-wrap gap-1 text-[11px] font-semibold">
                    <button
                      disabled={ocup}
                      onClick={() => void accion(tipo, f.key, f.publicada_at ? "no_publicada" : "publicada")}
                      className={`rounded-lg border px-2 py-1 transition disabled:opacity-40 ${f.publicada_at ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"}`}
                    >
                      {f.publicada_at ? "✓ Publicada (deshacer)" : "Marcar publicada"}
                    </button>
                    <a href={f.descarga} className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-white/60 transition hover:text-white">Descargar</a>
                    <button disabled={ocup} onClick={() => repetir(tipo, f.key)} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-40">Pedir otra</button>
                    <button disabled={ocup} onClick={() => eliminar(tipo, f.key)} className="rounded-lg border border-red-900/50 bg-red-950/40 px-2 py-1 text-red-300 transition hover:bg-red-950/70 disabled:opacity-40">Eliminar</button>
                  </div>
                </div>
              );
            })}
          </div>
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
      <div className="space-y-4">
        {seccion("perfil", fotos.perfilOpciones, "aspect-[3/4] w-28")}
        {seccion("banner", fotos.bannerOpciones, "aspect-[4/3] w-44")}
      </div>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {visor !== null && visor >= 0 ? <VisorFotos fotos={itemsVisor} indice={visor} onCambiar={setVisor} onCerrar={() => setVisor(null)} /> : null}
    </>
  );
}
