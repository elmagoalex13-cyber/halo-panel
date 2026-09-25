"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrialReelRow } from "@/app/api/trial-reels/route";

function r2Url(key: string | null): string | null {
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return base ? `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}` : null;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

function SpooferBadge({ params }: { params: Record<string, unknown> | null }) {
  if (!params) return null;
  const tags = [
    params.trim_start != null ? `−${params.trim_start}s inicio` : null,
    params.trim_end != null ? `−${params.trim_end}s final` : null,
    params.zoom != null ? `zoom ×${params.zoom}` : null,
    params.brightness != null && params.brightness !== 1 ? `brillo ${Number(params.brightness) > 1 ? "+" : ""}${((Number(params.brightness) - 1) * 100).toFixed(0)}%` : null,
    params.contrast != null && params.contrast !== 1 ? `contraste ${Number(params.contrast) > 1 ? "+" : ""}${((Number(params.contrast) - 1) * 100).toFixed(0)}%` : null,
    params.saturation != null && params.saturation !== 1 ? `saturación ${Number(params.saturation) > 1 ? "+" : ""}${((Number(params.saturation) - 1) * 100).toFixed(0)}%` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="rounded bg-halo-muted/60 px-1.5 py-0.5 text-[10px] text-halo-subtle font-mono">
          {tag}
        </span>
      ))}
    </div>
  );
}

export function TrialReelsMesa() {
  const [rows, setRows] = useState<TrialReelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrialReelRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [nota, setNota] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trial-reels");
      const json = await res.json();
      setRows(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function accion(accion: "aprobar" | "rechazar") {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/trial-reels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, accion, nota }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessage({ type: "ok", text: accion === "aprobar" ? "Trial reel aprobado — listo para descargar" : "Trial reel rechazado" });
        setRows((prev) => prev.filter((r) => r.id !== selected.id));
        setSelected(null);
        setNota("");
        setShowReject(false);
      } else {
        setMessage({ type: "err", text: "Error al procesar la acción" });
      }
    } finally {
      setActionLoading(false);
    }
  }

  function openRow(row: TrialReelRow) {
    setSelected(row);
    setNota("");
    setShowReject(false);
    setMessage(null);
  }

  const spoofeadoUrl = r2Url(selected?.storage_path_spoofeado ?? null);
  const originalUrl = r2Url(selected?.pieza_origen_r2_key ?? null);

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm flex items-center gap-2 ${message.type === "ok" ? "border-green-500/30 bg-green-950/30 text-green-300" : "border-red-500/30 bg-red-950/30 text-red-300"}`}>
          <span>{message.type === "ok" ? "✓" : "✗"}</span>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {loading ? (
        <div className="grid min-h-[20vh] place-items-center text-sm text-halo-subtle">Cargando trial reels...</div>
      ) : rows.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-halo-border bg-halo-muted/20 text-sm text-halo-subtle">
          Sin trial reels pendientes de aprobación
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <button
              key={row.id}
              onClick={() => openRow(row)}
              className={`rounded-2xl border p-4 text-left transition hover:border-halo-accent/30 ${selected?.id === row.id ? "border-halo-accent/40 bg-halo-accent/5" : "border-halo-border bg-halo-muted/20"}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-halo-text">@{row.cuenta_username ?? "—"}</span>
                {row.riesgo_repeticion && (
                  <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-400">⚠ Riesgo</span>
                )}
              </div>
              <p className="text-xs text-halo-subtle mb-1">{row.modelo_nombre ?? "—"}</p>
              <div className="flex gap-3 text-xs text-halo-subtle mt-2">
                <span>👁 {fmt(row.views_original)} vistas</span>
                <span>❤ {fmt(row.likes_original)} likes</span>
                <span>Uso #{row.usos_previos + 1}</span>
              </div>
              {row.ultima_vez_usado && (
                <p className="mt-1 text-[10px] text-halo-subtle">Último uso: {row.ultima_vez_usado}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="glass-card w-full max-w-4xl space-y-4 overflow-y-auto max-h-[90vh] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-halo-subtle uppercase tracking-wider font-semibold">Trial Reel</p>
                <h2 className="text-lg font-semibold text-halo-text mt-0.5">@{selected.cuenta_username ?? "—"} · {selected.modelo_nombre}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-halo-subtle hover:text-halo-text text-lg">✕</button>
            </div>

            {/* Stats del original */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-halo-border bg-halo-muted/20 p-3 text-center">
                <p className="text-[10px] text-halo-subtle uppercase tracking-wider">Vistas original</p>
                <p className="mt-1 font-mono text-lg font-semibold text-halo-text">{fmt(selected.views_original)}</p>
              </div>
              <div className="rounded-xl border border-halo-border bg-halo-muted/20 p-3 text-center">
                <p className="text-[10px] text-halo-subtle uppercase tracking-wider">Likes original</p>
                <p className="mt-1 font-mono text-lg font-semibold text-halo-text">{fmt(selected.likes_original)}</p>
              </div>
              <div className="rounded-xl border border-halo-border bg-halo-muted/20 p-3 text-center">
                <p className="text-[10px] text-halo-subtle uppercase tracking-wider">Usos anteriores</p>
                <p className={`mt-1 font-mono text-lg font-semibold ${selected.usos_previos >= 2 ? "text-amber-400" : "text-halo-text"}`}>{selected.usos_previos}</p>
              </div>
            </div>

            {selected.riesgo_repeticion && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-300">
                ⚠ Este vídeo fue usado recientemente o supera el límite de usos recomendado. Revisa antes de aprobar.
              </div>
            )}

            {/* Spoofer params */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-halo-subtle">Ajustes del spoofer aplicados</p>
              <SpooferBadge params={selected.spoofer_params} />
            </div>

            {/* Videos */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-halo-subtle">Original (ya publicado)</p>
                <div className="aspect-[9/16] max-h-[50vh] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                  {originalUrl ? (
                    <video key={`orig-${selected.id}`} src={originalUrl} controls playsInline className="h-full w-full object-contain" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-white/25">Sin vídeo original</div>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-halo-subtle">Spoofeado (listo para subir)</p>
                <div className="aspect-[9/16] max-h-[50vh] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                  {spoofeadoUrl ? (
                    <video key={`spoof-${selected.id}`} src={spoofeadoUrl} controls playsInline className="h-full w-full object-contain" />
                  ) : (
                    <div className="grid h-full place-items-center text-center text-xs text-white/25 px-4">
                      <p>Vídeo spoofeado</p>
                      <p className="mt-1 opacity-50">(disponible cuando el runner procese este trial)</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {spoofeadoUrl && (
              <a
                href={spoofeadoUrl}
                download
                className="btn-secondary flex items-center justify-center gap-2 py-2 text-sm"
              >
                ↓ Descargar trial reel spoofeado
              </a>
            )}

            {/* Acciones */}
            {!showReject ? (
              <div className="flex gap-3">
                <button
                  onClick={() => accion("aprobar")}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-40 transition"
                >
                  {actionLoading ? "Procesando..." : "✓ Aprobar trial reel"}
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={actionLoading}
                  className="rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-950/50 disabled:opacity-40 transition"
                >
                  ✕ Rechazar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  className="input-base h-20 resize-none text-sm"
                  placeholder="Motivo del rechazo (opcional)..."
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => accion("rechazar")}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-red-700 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 transition"
                  >
                    {actionLoading ? "Rechazando..." : "Confirmar rechazo"}
                  </button>
                  <button onClick={() => setShowReject(false)} className="btn-secondary px-4 py-2.5 text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
