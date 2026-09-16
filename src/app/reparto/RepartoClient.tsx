"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RepartoRow } from "./page";
import { formatDate, tipoVideoLabel } from "@/lib/utils";

const ESTADO_COLORS: Record<string, string> = {
  en_reparto: "bg-blue-500/20 text-blue-300",
  editando: "bg-yellow-500/20 text-yellow-300",
  en_aprobacion: "bg-orange-500/20 text-orange-300",
  aprobado: "bg-green-500/20 text-green-300",
};
const ESTADO_LABELS: Record<string, string> = {
  en_reparto: "En reparto",
  editando: "Editando",
  en_aprobacion: "En aprobación",
  aprobado: "Aprobado",
};

export function RepartoClient({
  asignaciones,
  modelos,
  cuentas,
  pendientes,
}: {
  asignaciones: RepartoRow[];
  modelos: { id: string; nombre: string }[];
  cuentas: { id: string; username: string; modelo_id: string; activa: boolean }[];
  pendientes: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [asignando, setAsignando] = useState(false);
  const [selected, setSelected] = useState<RepartoRow | null>(null);
  const [cuentaId, setCuentaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtroModelo, setFiltroModelo] = useState("all");
  const [filtroEstado, setFiltroEstado] = useState("all");

  const filtered = asignaciones.filter((a) => {
    if (filtroModelo !== "all" && a.modelo?.nombre !== filtroModelo) return false;
    if (filtroEstado !== "all" && a.estado !== filtroEstado) return false;
    return true;
  });

  async function ejecutarReparto() {
    setAsignando(true);
    try {
      const res = await fetch("/api/reparto/ejecutar", { method: "POST" });
      const json = await res.json();
      alert(`Reparto ejecutado: ${json.asignados ?? 0} vídeos asignados`);
      startTransition(() => router.refresh());
    } catch {
      alert("Error al ejecutar el reparto");
    } finally {
      setAsignando(false);
    }
  }

  async function asignarManual() {
    if (!selected || !cuentaId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/biblioteca/${selected.id}/clasificar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta_destino_id: cuentaId, estado: "en_reparto" }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
        setSelected(null);
        setCuentaId("");
      }
    } finally {
      setLoading(false);
    }
  }

  const modeloNames = [...new Set(asignaciones.map((a) => a.modelo?.nombre).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      {/* Stats y botón reparto */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-center">
            <p className="text-2xl font-bold text-halo-text">{pendientes}</p>
            <p className="text-xs text-zinc-500">Pendientes de asignar</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-center">
            <p className="text-2xl font-bold text-halo-text">{asignaciones.filter(a => a.estado === "en_reparto").length}</p>
            <p className="text-xs text-zinc-500">En reparto ahora</p>
          </div>
        </div>
        <button
          onClick={ejecutarReparto}
          disabled={asignando || pendientes === 0}
          className="ml-auto rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7C3AED] disabled:opacity-40"
        >
          {asignando ? "Ejecutando…" : `▶ Ejecutar Reparto (${pendientes} pendientes)`}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}
          className="rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
        >
          <option value="all">Todas las modelos</option>
          {modeloNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(ESTADO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {isPending && <span className="self-center text-xs text-zinc-500">Cargando…</span>}
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-zinc-800 text-zinc-500">
          No hay vídeos en reparto
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="px-4 py-3 text-left">Archivo</th>
                <th className="px-4 py-3 text-left">Modelo</th>
                <th className="px-4 py-3 text-left">Cuenta</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Asignado</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="max-w-[180px] truncate px-4 py-3 text-zinc-100">
                    {row.filename_original ?? row.titulo ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{row.modelo?.nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {row.cuenta?.username ? `@${row.cuenta.username}` : <span className="text-zinc-600">Sin asignar</span>}
                  </td>
                  <td className="px-4 py-3">
                    {row.tipo_video ? (
                      <span className="rounded bg-[#8B5CF6]/20 px-2 py-0.5 text-xs text-[#A78BFA]">
                        {tipoVideoLabel(row.tipo_video)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLORS[row.estado] ?? "bg-zinc-700 text-zinc-300"}`}>
                      {ESTADO_LABELS[row.estado] ?? row.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{row.asignada_at ? formatDate(row.asignada_at) : "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelected(row); setCuentaId(""); }}
                      className="text-xs text-[#8B5CF6] hover:text-[#A78BFA]"
                    >
                      Reasignar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal asignación manual */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#0a0a12] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 font-display text-lg font-semibold text-white">Asignar cuenta manualmente</h3>
            <p className="mb-4 text-sm text-zinc-400 truncate">{selected.filename_original ?? selected.titulo}</p>
            <select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
            >
              <option value="">Seleccionar cuenta…</option>
              {cuentas.filter((c) => c.activa).map((c) => (
                <option key={c.id} value={c.id}>@{c.username}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                Cancelar
              </button>
              <button
                onClick={asignarManual}
                disabled={!cuentaId || loading}
                className="flex-1 rounded-lg bg-[#8B5CF6] py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-[#7C3AED]"
              >
                {loading ? "Asignando…" : "Asignar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
