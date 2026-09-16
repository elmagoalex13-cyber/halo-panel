"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { formatDate } from "@/lib/utils";
import { FORMATO_GROUPS, formatoLabel } from "@/lib/formatoVideo";
import type { ReferenciaVideo } from "@/types";

function isWithinDays(iso: string | null | undefined, days: number) {
  if (!iso) return false;
  const diff = Date.now() - new Date(iso).getTime();
  return diff <= days * 86400000;
}

function formatVisitas(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")} K`;
  return `${value}`;
}

function videoUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return base ? `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}` : null;
}

const CONFIRMADOS_EXPIRY_HOURS = 24;

function isRecent(iso: string | null | undefined, hours: number) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() <= hours * 3600000;
}

export function IdeasViralesTab({ videos: initialVideos }: { videos: ReferenciaVideo[] }) {
  const [videos, setVideos] = useState(initialVideos);
  const [only7d, setOnly7d] = useState(false);
  const [index, setIndex] = useState(0);
  const [selectedFormato, setSelectedFormato] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"triaje" | "confirmados">("triaje");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [preview, setPreview] = useState<ReferenciaVideo | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const pendientes = useMemo(() => {
    return videos
      .filter((v) => v.estado_triaje !== "confirmado" && v.estado_triaje !== "descartado")
      .filter((v) => (only7d ? isWithinDays(v.fecha_publicacion, 7) : true))
      .sort((a, b) => b.visitas - a.visitas);
  }, [videos, only7d]);

  const confirmadosRecientes = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    nowTick;
    return videos
      .filter((v) => v.estado_triaje === "confirmado" && isRecent(v.confirmado_at, CONFIRMADOS_EXPIRY_HOURS))
      .sort((a, b) => new Date(b.confirmado_at ?? 0).getTime() - new Date(a.confirmado_at ?? 0).getTime());
  }, [videos, nowTick]);

  const conPropuestaCount = pendientes.filter((v) => v.formato_propuesto).length;
  const current = pendientes[Math.min(index, pendientes.length - 1)];

  useEffect(() => {
    setIndex(0);
  }, [only7d]);

  useEffect(() => {
    setSelectedFormato(current?.formato_confirmado ?? current?.formato_propuesto ?? null);
  }, [current]);

  async function persist(video: ReferenciaVideo, patch: { formato_confirmado?: string | null; estado_triaje: string; confirmado_at?: string | null }) {
    setSaving(true);
    try {
      await fetch(`/api/referencias/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, ...patch } as ReferenciaVideo : v)));
    } finally {
      setSaving(false);
    }
  }

  function confirmar() {
    if (!current) return;
    persist(current, { formato_confirmado: selectedFormato, estado_triaje: "confirmado", confirmado_at: new Date().toISOString() });
  }

  function saltar() {
    setIndex((i) => (pendientes.length ? (i + 1) % pendientes.length : 0));
  }

  function descartar() {
    if (!current) return;
    persist(current, { estado_triaje: "descartado" });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (view !== "triaje" || !current) return;
      if (event.key >= "1" && event.key <= "7") {
        const num = Number(event.key);
        const option = FORMATO_GROUPS.flatMap((g) => g.options).find((o) => o.num === num);
        if (option) setSelectedFormato(option.key);
      } else if (event.key === "Enter") {
        confirmar();
      } else if (event.key === " ") {
        event.preventDefault();
        saltar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, current, selectedFormato, pendientes.length]);

  const url = videoUrl(current?.video_url);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button
          onClick={() => setView("triaje")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            view === "triaje" ? "bg-[#8B5CF6] text-white" : "bg-white/[0.05] text-white/50 hover:text-white/80"
          }`}
        >
          Triaje
        </button>
        <button
          onClick={() => setView("confirmados")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            view === "confirmados" ? "bg-[#8B5CF6] text-white" : "bg-white/[0.05] text-white/50 hover:text-white/80"
          }`}
        >
          Confirmados{confirmadosRecientes.length > 0 ? ` (${confirmadosRecientes.length})` : ""}
        </button>
      </div>

      {view === "confirmados" ? (
        <div>
          <p className="mb-3 text-xs text-white/30">
            Se ocultan automaticamente {CONFIRMADOS_EXPIRY_HOURS}h despues de confirmarse.
          </p>
          {confirmadosRecientes.length === 0 ? (
            <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-white/35">
              Sin confirmaciones recientes.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {confirmadosRecientes.map((video) => (
                <button
                  key={video.id}
                  onClick={() => setPreview(video)}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="h-16 w-10 shrink-0 overflow-hidden rounded-lg bg-black">
                    {video.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnail_url} alt="Video thumbnail" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/85">@{video.cuenta_username ?? "?"}</p>
                    <p className="mt-0.5 truncate text-[11px] text-white/30">
                      {formatVisitas(video.visitas)} vistas · {formatDate(video.fecha_publicacion)}
                    </p>
                  </div>
                  <span className="badge shrink-0 text-[9px]">{formatoLabel(video.formato_confirmado) ?? "Sin formato"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
            <div>
              <p className="font-display text-lg font-semibold text-white">
                Triaje <span className="text-white/40">·</span> {pendientes.length} sin clasificar{" "}
                <span className="text-white/40">·</span> {conPropuestaCount} con propuesta
              </p>
              <p className="text-xs text-white/30">1-7 formato · Enter confirma · Espacio salta</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input type="checkbox" checked={only7d} onChange={(e) => setOnly7d(e.target.checked)} className="accent-[#8B5CF6]" />
              Solo ultimos 7 dias
            </label>
          </div>

          {!current ? (
            <div className="grid min-h-[40vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-white/35">
              {only7d ? "Nada nuevo en los ultimos 7 dias." : "Todo triado. Sin videos pendientes."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
              <div>
                <div className="mx-auto max-h-[60vh] w-full max-w-[280px] overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
                  {url ? (
                    <video key={current.id} src={url} controls playsInline className="aspect-[9/16] h-full w-full object-contain" />
                  ) : (
                    <div className="grid aspect-[9/16] place-items-center text-xs text-white/25">Sin video</div>
                  )}
                </div>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="btn-secondary mt-2 flex items-center justify-center py-1.5 text-xs">
                    ⤢ Ver en grande
                  </a>
                ) : null}
                <p className="mt-2 text-center text-[11px] text-white/30">
                  #{current.id.slice(-6)} · @{current.cuenta_username ?? "?"} · {formatVisitas(current.visitas)} vistas
                </p>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                {current.lo_que_pone ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/70">Lo que pone</p>
                    <p className="text-sm text-white/85">{current.lo_que_pone}</p>
                  </div>
                ) : null}

                {(current.palabras_voz || current.frase_detectada || current.tags?.length) ? (
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/55">
                    {[
                      current.palabras_voz != null ? `${current.palabras_voz} palabras de voz` : null,
                      current.mira_camara != null ? (current.mira_camara ? "mira a camara" : "no mira a camara") : null,
                      current.frase_detectada ? `«${current.frase_detectada}»` : null,
                      current.sin_formato_marcado ? "habla de un tema, sin formato marcado (falta de señal)" : null,
                      current.tags?.length ? `texto: «${current.tags.join(" · ")}»` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Formato</p>
                  <div className="space-y-2">
                    {FORMATO_GROUPS.map((group) => (
                      <div key={group.key}>
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.options.map((option) => {
                            const active = selectedFormato === option.key;
                            return (
                              <button
                                key={option.key}
                                onClick={() => setSelectedFormato(option.key)}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                                  active
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                    : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/20"
                                }`}
                              >
                                {option.num} {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                  <button
                    onClick={confirmar}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  >
                    ✓ Confirmar
                  </button>
                  <button onClick={saltar} className="btn-secondary px-4 py-2 text-sm">
                    ⤼ Saltar
                  </button>
                  <button
                    onClick={descartar}
                    disabled={saving}
                    className="ml-auto rounded-lg border border-red-900/40 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-950/50 disabled:opacity-40"
                  >
                    🗑 Descartar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-xs overflow-hidden p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="truncate text-xs font-semibold text-white/70">@{preview.cuenta_username ?? "?"}</p>
              <button onClick={() => setPreview(null)} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-white/[0.08] hover:text-white">
                ✕
              </button>
            </div>
            <div className="mx-auto max-h-[65vh] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
              {videoUrl(preview.video_url) ? (
                <video
                  key={preview.id}
                  src={videoUrl(preview.video_url)!}
                  controls
                  autoPlay
                  playsInline
                  className="aspect-[9/16] h-full w-full object-contain"
                />
              ) : (
                <div className="grid aspect-[9/16] place-items-center text-xs text-white/25">Sin video</div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-white/30">
              <span>{formatVisitas(preview.visitas)} vistas</span>
              <span className="badge text-[9px]">{formatoLabel(preview.formato_confirmado) ?? "Sin formato"}</span>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
