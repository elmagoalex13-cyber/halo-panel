"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicacionRow } from "./page";
import { tipoVideoLabel } from "@/lib/utils";

function esMismoMes(dateStr: string | null, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

function esMismaSemana(dateStr: string | null, weekStart: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function getWeekStart(offset = 0): Date {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDia(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarioClient({
  publicaciones,
  cuentas,
}: {
  publicaciones: PublicacionRow[];
  cuentas: { id: string; username: string; modelo_id: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vista, setVista] = useState<"semana" | "mes">("semana");
  const [weekOffset, setWeekOffset] = useState(0);
  const [now] = useState(new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const year = now.getFullYear();
  const month = (now.getMonth() + monthOffset + 12) % 12;
  const monthYear = year + Math.floor((now.getMonth() + monthOffset) / 12);

  const dias: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const pubsSemana = publicaciones.filter(
    (p) => esMismaSemana(p.publicado_at, weekStart) || (vista === "semana" && !p.publicado_at && esMismaSemana(p.aprobado_at, weekStart))
  );
  const pubsMes = publicaciones.filter(
    (p) => esMismoMes(p.publicado_at ?? p.aprobado_at, monthYear, month)
  );

  const monthName = new Date(monthYear, month, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const daysInMonth = new Date(monthYear, month + 1, 0).getDate();
  const firstDay = (new Date(monthYear, month, 1).getDay() || 7) - 1;

  async function guardarUrl(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/calendario/${id}/publicar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url_publicado: urlInput, publicado_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "No se pudo marcar como publicado");
        return;
      }
      setError(null);
      startTransition(() => router.refresh());
      setEditingId(null);
      setUrlInput("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-zinc-800 overflow-hidden">
          {(["semana", "mes"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                vista === v ? "bg-[#8B5CF6] text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {vista === "semana" && (
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset((o) => o - 1)} className="rounded px-2 py-1 text-zinc-400 hover:text-white">‹</button>
            <span className="text-sm text-zinc-300">
              {weekStart.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} –{" "}
              {dias[6].toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
            </span>
            <button onClick={() => setWeekOffset((o) => o + 1)} className="rounded px-2 py-1 text-zinc-400 hover:text-white">›</button>
            <button onClick={() => setWeekOffset(0)} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300">Hoy</button>
          </div>
        )}
        {vista === "mes" && (
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="rounded px-2 py-1 text-zinc-400 hover:text-white">‹</button>
            <span className="text-sm capitalize text-zinc-300">{monthName}</span>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="rounded px-2 py-1 text-zinc-400 hover:text-white">›</button>
            <button onClick={() => setMonthOffset(0)} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300">Hoy</button>
          </div>
        )}
        {isPending && <span className="text-xs text-zinc-500">Actualizando…</span>}
      </div>

      {/* Vista semana */}
      {vista === "semana" && (
        <div className="grid grid-cols-7 gap-2">
          {dias.map((dia, i) => {
            const isHoy = dia.toDateString() === now.toDateString();
            const diaStr = dia.toISOString().split("T")[0];
            const pubs = pubsSemana.filter((p) => {
              const fecha = p.publicado_at ?? p.aprobado_at;
              return fecha && new Date(fecha).toISOString().split("T")[0] === diaStr;
            });
            return (
              <div key={i} className={`min-h-[120px] rounded-xl border p-2 ${isHoy ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/5" : "border-zinc-800 bg-zinc-900/40"}`}>
                <p className={`mb-2 text-xs font-medium ${isHoy ? "text-[#A78BFA]" : "text-zinc-500"}`}>
                  {DIAS_SEMANA[i]} {dia.getDate()}
                </p>
                {pubs.map((p) => (
                  <div key={p.id} className={`mb-1 rounded p-1.5 text-xs ${p.estado === "publicado" ? "bg-green-500/10 border border-green-500/20" : "bg-orange-500/10 border border-orange-500/20"}`}>
                    <p className="truncate font-medium text-zinc-200">@{p.cuenta?.username ?? "—"}</p>
                    <p className="text-zinc-500">{p.tipo_video ? tipoVideoLabel(p.tipo_video) : "—"}</p>
                    {p.estado === "aprobado" && !p.publicado_at && (
                      <button
                        onClick={() => { setEditingId(p.id); setUrlInput(""); }}
                        className="mt-1 text-[#8B5CF6] hover:text-[#A78BFA]"
                      >
                        + URL
                      </button>
                    )}
                    {p.url_publicado && (
                      <a href={p.url_publicado} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">↗ Ver</a>
                    )}
                  </div>
                ))}
                {pubs.length === 0 && <p className="text-xs text-zinc-700">—</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Vista mes */}
      {vista === "mes" && (
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-zinc-600">
            {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const dayNum = i + 1;
              const diaStr = `${monthYear}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const isHoy = new Date().toISOString().split("T")[0] === diaStr;
              const pubs = pubsMes.filter((p) => {
                const fecha = p.publicado_at ?? p.aprobado_at;
                return fecha && new Date(fecha).toISOString().split("T")[0] === diaStr;
              });
              return (
                <div
                  key={dayNum}
                  className={`min-h-[70px] rounded-lg border p-1 ${isHoy ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/5" : "border-zinc-800 bg-zinc-900/30"}`}
                >
                  <p className={`mb-1 text-xs ${isHoy ? "font-bold text-[#A78BFA]" : "text-zinc-600"}`}>{dayNum}</p>
                  {pubs.slice(0, 3).map((p) => (
                    <div key={p.id} className={`mb-0.5 rounded px-1 text-[10px] truncate ${p.estado === "publicado" ? "bg-green-500/15 text-green-300" : "bg-orange-500/15 text-orange-300"}`}>
                      @{p.cuenta?.username ?? "—"}
                    </div>
                  ))}
                  {pubs.length > 3 && <p className="text-[10px] text-zinc-600">+{pubs.length - 3}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de aprobados sin publicar */}
      {publicaciones.filter((p) => p.estado === "aprobado" && !p.publicado_at).length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Aprobados pendientes de publicar</h2>
          <div className="space-y-2">
            {publicaciones.filter((p) => p.estado === "aprobado" && !p.publicado_at).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100">@{p.cuenta?.username ?? "—"} · {p.modelo?.nombre ?? "—"}</p>
                  <p className="text-xs text-zinc-500">{p.tipo_video ? tipoVideoLabel(p.tipo_video) : "—"}</p>
                </div>
                {editingId === p.id ? (
                  <div className="flex gap-2">
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://instagram.com/reel/..."
                      className="w-52 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
                    />
                    <button
                      onClick={() => guardarUrl(p.id)}
                      disabled={saving || !urlInput}
                      className="rounded-lg bg-[#8B5CF6] px-3 py-1 text-xs text-white disabled:opacity-40"
                    >
                      {saving ? "…" : "Guardar"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-zinc-500">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingId(p.id); setUrlInput(""); }}
                    className="rounded-lg border border-[#8B5CF6]/30 px-3 py-1.5 text-xs text-[#A78BFA] hover:bg-[#8B5CF6]/10"
                  >
                    Marcar publicado
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal URL */}
      {editingId && !publicaciones.find((p) => p.id === editingId && p.estado === "aprobado" && !p.publicado_at) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditingId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#0a0a12] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-display text-lg font-semibold text-white">URL del Reel publicado</h3>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://instagram.com/reel/..."
              className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setEditingId(null)} className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400">Cancelar</button>
              <button
                onClick={() => guardarUrl(editingId)}
                disabled={saving || !urlInput}
                className="flex-1 rounded-lg bg-[#8B5CF6] py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
