"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BibliotecaVideo } from "./page";
import { formatDate, tipoVideoLabel, formatBytes } from "@/lib/utils";

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function videoUrl(key: string | null): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return R2_BASE ? `${R2_BASE.replace(/\/$/, "")}/${key.replace(/^\//, "")}` : null;
}

function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    recibido: "bg-blue-500/20 text-blue-300",
    clasificando: "bg-yellow-500/20 text-yellow-300",
    etiquetado: "bg-green-500/20 text-green-300",
    en_reparto: "bg-purple-500/20 text-purple-300",
  };
  const labels: Record<string, string> = {
    recibido: "Recibido",
    clasificando: "Clasificando",
    etiquetado: "Etiquetado",
    en_reparto: "En reparto",
  };
  return { cls: map[estado] ?? "bg-zinc-500/20 text-zinc-300", label: labels[estado] ?? estado };
}

const TIPOS = ["all", "tipo1", "tipo2", "tipo3", "tipo4", "sin_clasificar"];

export function BibliotecaClient({
  videos,
  modelos,
  totalCounts,
  currentEstado,
  currentModelo,
  currentTipo,
}: {
  videos: BibliotecaVideo[];
  modelos: { id: string; nombre: string }[];
  totalCounts: { revisar: number; etiquetado: number; en_reparto: number; all: number };
  currentEstado: string;
  currentModelo: string;
  currentTipo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<BibliotecaVideo | null>(null);
  const [clasificandoId, setClasificandoId] = useState<string | null>(null);
  const [asignandoId, setAsignandoId] = useState<string | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState<string>("");

  function nav(params: Record<string, string>) {
    const url = new URLSearchParams({
      estado: currentEstado,
      modelo: currentModelo,
      tipo: currentTipo,
      ...params,
    });
    startTransition(() => router.push(`/biblioteca?${url.toString()}`));
  }

  const TABS = [
    { key: "all", label: "Todos", count: totalCounts.all },
    { key: "revisar", label: "Sin clasificar", count: totalCounts.revisar },
    { key: "etiquetado", label: "Etiquetados", count: totalCounts.etiquetado },
    { key: "en_reparto", label: "En reparto", count: totalCounts.en_reparto },
  ];

  async function clasificar(id: string, tipo: string) {
    setClasificandoId(id);
    try {
      const res = await fetch(`/api/biblioteca/${id}/clasificar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_video: tipo, estado: "etiquetado" }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
        setSelected(null);
      }
    } finally {
      setClasificandoId(null);
      setNuevoTipo("");
    }
  }

  async function enviarReparto(id: string) {
    setAsignandoId(id);
    try {
      const res = await fetch(`/api/biblioteca/${id}/clasificar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "en_reparto" }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
        setSelected(null);
      }
    } finally {
      setAsignandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs de estado */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => nav({ estado: tab.key })}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              currentEstado === tab.key
                ? "bg-[#8B5CF6] text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${currentEstado === tab.key ? "bg-white/20" : "bg-zinc-700"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={currentModelo}
          onChange={(e) => nav({ modelo: e.target.value })}
          className="rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
        >
          <option value="all">Todas las modelos</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
        <select
          value={currentTipo}
          onChange={(e) => nav({ tipo: e.target.value })}
          className="rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>{t === "all" ? "Todos los tipos" : tipoVideoLabel(t)}</option>
          ))}
        </select>
        {isPending && <span className="self-center text-xs text-zinc-500">Cargando…</span>}
      </div>

      {/* Lista de vídeos */}
      {videos.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-zinc-800 text-zinc-500">
          No hay vídeos en esta bandeja
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const { cls, label } = estadoBadge(v.estado);
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className="group flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-all hover:border-[#8B5CF6]/50 hover:bg-zinc-900"
              >
                {/* Miniatura / icono */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-2xl">
                    🎬
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {v.filename_original ?? v.titulo ?? "Sin nombre"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {v.modelo?.nombre ?? "—"} · {formatDate(v.recibido_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {v.tipo_video && v.tipo_video !== "sin_clasificar" && (
                    <span className="rounded bg-[#8B5CF6]/20 px-2 py-0.5 text-xs text-[#A78BFA]">
                      {tipoVideoLabel(v.tipo_video)}
                    </span>
                  )}
                  {!v.tipo_video || v.tipo_video === "sin_clasificar" ? (
                    <span className="rounded bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">Sin clasificar</span>
                  ) : null}
                  {v.size_bytes && (
                    <span className="rounded bg-zinc-700/30 px-2 py-0.5 text-xs text-zinc-500">
                      {formatBytes(v.size_bytes)}
                    </span>
                  )}
                </div>

                {v.clasificacion_ia && (
                  <p className="text-xs text-zinc-500 italic">
                    IA propone: {tipoVideoLabel(v.clasificacion_ia.tipo ?? "")}
                    {v.clasificacion_ia.confianza !== undefined && ` (${Math.round(v.clasificacion_ia.confianza * 100)}%)`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Panel de detalle */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div
            className="relative w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#0a0a12] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setSelected(null)} className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-200">✕</button>
            <h2 className="mb-4 font-display text-lg font-semibold text-white">
              {selected.filename_original ?? selected.titulo ?? "Vídeo"}
            </h2>

            {/* Video preview */}
            {videoUrl(selected.r2_key) && (
              <video
                src={videoUrl(selected.r2_key)!}
                controls
                className="mb-4 w-full rounded-xl bg-black"
                style={{ maxHeight: 300 }}
              />
            )}

            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500">Modelo</p>
                <p className="text-zinc-100">{selected.modelo?.nombre ?? "—"}</p>
              </div>
              <div>
                <p className="text-zinc-500">Estado</p>
                <p className="text-zinc-100">{estadoBadge(selected.estado).label}</p>
              </div>
              <div>
                <p className="text-zinc-500">Recibido</p>
                <p className="text-zinc-100">{formatDate(selected.recibido_at)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Tamaño</p>
                <p className="text-zinc-100">{selected.size_bytes ? formatBytes(selected.size_bytes) : "—"}</p>
              </div>
            </div>

            {selected.clasificacion_ia && (
              <div className="mb-4 rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 p-3 text-sm">
                <p className="mb-1 font-medium text-[#A78BFA]">Propuesta IA</p>
                <p className="text-zinc-300">
                  Tipo: {tipoVideoLabel(selected.clasificacion_ia.tipo ?? "")}
                  {selected.clasificacion_ia.confianza !== undefined &&
                    ` · Confianza: ${Math.round(selected.clasificacion_ia.confianza * 100)}%`}
                </p>
                {selected.clasificacion_ia.razon && (
                  <p className="mt-1 text-zinc-500 italic">{selected.clasificacion_ia.razon}</p>
                )}
              </div>
            )}

            {/* Clasificación manual */}
            {selected.estado !== "en_reparto" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select
                    value={nuevoTipo}
                    onChange={(e) => setNuevoTipo(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
                  >
                    <option value="">Seleccionar tipo…</option>
                    <option value="tipo1">Tipo 1</option>
                    <option value="tipo2">Tipo 2</option>
                    <option value="tipo3">Tipo 3</option>
                    <option value="tipo4">Tipo 4 — Referencia</option>
                  </select>
                  <button
                    onClick={() => nuevoTipo && clasificar(selected.id, nuevoTipo)}
                    disabled={!nuevoTipo || clasificandoId === selected.id}
                    className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-[#7C3AED] transition-colors"
                  >
                    {clasificandoId === selected.id ? "…" : "Etiquetar"}
                  </button>
                </div>

                {selected.estado === "etiquetado" && (
                  <button
                    onClick={() => enviarReparto(selected.id)}
                    disabled={asignandoId === selected.id}
                    className="w-full rounded-lg border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 py-2 text-sm font-medium text-[#A78BFA] hover:bg-[#8B5CF6]/20 transition-colors disabled:opacity-40"
                  >
                    {asignandoId === selected.id ? "Enviando…" : "→ Enviar a Reparto"}
                  </button>
                )}
              </div>
            )}

            {selected.estado === "en_reparto" && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-center text-sm text-green-300">
                ✓ Este vídeo ya está en reparto
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
