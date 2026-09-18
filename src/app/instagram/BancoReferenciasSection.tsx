"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import type { BancoReferenciaVideo, Modelo } from "@/types";

function formatNum(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(value);
}

export function BancoReferenciasSection({
  videos,
  modelos,
}: {
  videos: BancoReferenciaVideo[];
  modelos: Modelo[];
}) {
  const router = useRouter();
  const [filtroCuenta, setFiltroCuenta] = useState("all");
  const [selected, setSelected] = useState<BancoReferenciaVideo | null>(null);
  const [modeloId, setModeloId] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [urlManual, setUrlManual] = useState("");
  const [fraseManual, setFraseManual] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const usernames = useMemo(
    () => Array.from(new Set(videos.map((v) => v.cuenta_username).filter((u): u is string => Boolean(u)))).sort(),
    [videos],
  );

  const filtered = useMemo(
    () => (filtroCuenta === "all" ? videos : videos.filter((v) => v.cuenta_username === filtroCuenta)),
    [videos, filtroCuenta],
  );

  function openEnviar(video: BancoReferenciaVideo) {
    setSelected(video);
    setModeloId("");
    setInstrucciones("");
    setEnviado(false);
  }

  async function enviarAModelo() {
    if (!selected || !modeloId) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/referencias/banco/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelo_id: modeloId,
          banco_id: selected.id,
          url_referencia_ig: selected.url_referencia,
          instrucciones: instrucciones || null,
        }),
      });
      if (res.ok) {
        setEnviado(true);
        setTimeout(() => {
          setSelected(null);
          router.refresh();
        }, 1200);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function addManual() {
    if (!urlManual) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/referencias/banco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url_ig: urlManual, frase: fraseManual || null }),
      });
      if (res.ok) {
        setShowAdd(false);
        setUrlManual("");
        setFraseManual("");
        router.refresh();
      }
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-white">Banco de referencias virales</h2>
          <select value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)} className="input-base w-auto py-1.5 text-xs">
            <option value="all">Todas las cuentas</option>
            {usernames.map((username) => (
              <option key={username} value={username}>
                @{username}
              </option>
            ))}
          </select>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Anadir referencia manual
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-center text-sm text-white/35">
          <div>
            <p>Sin videos de referencia todavia</p>
            <p className="mt-1 text-xs text-white/25">El bot los recogera al scrapear las cuentas de referencia</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((video) => (
            <GlassCard key={video.id} className="group flex cursor-pointer flex-col p-3" onClick={() => openEnviar(video)}>
              <div className="mb-2 grid aspect-[9/16] max-h-40 w-full place-items-center overflow-hidden rounded-xl bg-white/[0.04] text-3xl">
                {video.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  "🎬"
                )}
              </div>
              {video.cuenta_username ? <p className="mb-1 truncate text-xs font-semibold text-[#A78BFA]">@{video.cuenta_username}</p> : null}
              {video.frase ? <p className="mb-1.5 line-clamp-2 text-sm text-white/85">&quot;{video.frase}&quot;</p> : null}
              {video.cancion_nombre ? (
                <p className="mb-1.5 truncate text-xs text-white/35">
                  🎵 {video.cancion_nombre}
                  {video.cancion_artista ? ` — ${video.cancion_artista}` : ""}
                </p>
              ) : null}
              <div className="mt-auto flex items-center gap-3 text-xs text-white/40">
                {video.views_referencia !== null ? <span>👁 {formatNum(video.views_referencia)}</span> : null}
                {video.likes_referencia !== null ? <span>❤ {formatNum(video.likes_referencia)}</span> : null}
                {video.origen === "manual" ? <span className="badge ml-auto text-[9px]">Manual</span> : null}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEnviar(video);
                }}
                className="btn-secondary mt-2 py-1.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
              >
                → Enviar a modelo
              </button>
            </GlassCard>
          ))}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-md p-6">
            <h3 className="mb-1 font-display text-lg font-semibold text-white">Enviar a modelo</h3>
            {selected.frase ? <p className="mb-4 text-sm italic text-white/50">&quot;{selected.frase}&quot;</p> : null}

            <div className="space-y-3">
              <select value={modeloId} onChange={(e) => setModeloId(e.target.value)} className="input-base">
                <option value="">Seleccionar modelo...</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <textarea
                value={instrucciones}
                onChange={(e) => setInstrucciones(e.target.value)}
                placeholder="Instrucciones adicionales (opcional)..."
                rows={3}
                className="input-base resize-none"
              />
              {selected.url_referencia ? (
                <a
                  href={selected.url_referencia}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ver video original en Instagram
                </a>
              ) : null}
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              {enviado ? (
                <div className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500/15 py-2.5 text-sm text-emerald-300">
                  ✓ Asignado
                </div>
              ) : (
                <button
                  onClick={enviarAModelo}
                  disabled={!modeloId || enviando}
                  className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-40"
                >
                  {enviando ? "Enviando..." : "Asignar a modelo"}
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      ) : null}

      {showAdd ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-md p-6">
            <h3 className="mb-4 font-display text-lg font-semibold text-white">Anadir referencia manualmente</h3>
            <div className="space-y-3">
              <input
                value={urlManual}
                onChange={(e) => setUrlManual(e.target.value)}
                placeholder="https://instagram.com/reel/..."
                className="input-base"
              />
              <input
                value={fraseManual}
                onChange={(e) => setFraseManual(e.target.value)}
                placeholder="Frase o descripcion (opcional)"
                className="input-base"
              />
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={addManual} disabled={!urlManual || addLoading} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-40">
                {addLoading ? "Guardando..." : "Anadir"}
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
