"use client";

import { useMemo, useState } from "react";
import type { MetricaRow } from "./page";
import { tipoVideoLabel } from "@/lib/utils";

type Stat = {
  tipo: string;
  total: number;
  aprobados: number;
  publicados: number;
  rechazados: number;
  tasaAprobacion: number;
  tiempoMedioAprobacion: number | null;
};

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function computeStats(rows: MetricaRow[]): Stat[] {
  const byTipo: Record<string, MetricaRow[]> = {};
  for (const r of rows) {
    const tipo = r.tipo_video ?? "sin_clasificar";
    if (!byTipo[tipo]) byTipo[tipo] = [];
    byTipo[tipo].push(r);
  }
  return Object.entries(byTipo).map(([tipo, rs]) => {
    const aprobados = rs.filter((r) => ["aprobado", "publicado"].includes(r.estado)).length;
    const publicados = rs.filter((r) => r.estado === "publicado").length;
    const rechazados = rs.filter((r) => r.estado === "rechazado").length;
    const tasaBase = rs.filter((r) => ["aprobado", "publicado", "rechazado"].includes(r.estado)).length;
    const tiempos = rs
      .filter((r) => r.aprobado_at && r.recibido_at)
      .map((r) => daysBetween(r.recibido_at, r.aprobado_at!));
    return {
      tipo,
      total: rs.length,
      aprobados,
      publicados,
      rechazados,
      tasaAprobacion: tasaBase > 0 ? Math.round((aprobados / tasaBase) * 100) : 0,
      tiempoMedioAprobacion: tiempos.length > 0 ? Math.round((tiempos.reduce((a, b) => a + b, 0) / tiempos.length) * 10) / 10 : null,
    };
  }).sort((a, b) => b.total - a.total);
}

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  return monday.toISOString().split("T")[0];
}

function computeWeekly(rows: MetricaRow[]): { week: string; recibidos: number; aprobados: number; publicados: number }[] {
  const byWeek: Record<string, { recibidos: number; aprobados: number; publicados: number }> = {};
  for (const r of rows) {
    const w = weekLabel(r.recibido_at);
    if (!byWeek[w]) byWeek[w] = { recibidos: 0, aprobados: 0, publicados: 0 };
    byWeek[w].recibidos++;
    if (["aprobado", "publicado"].includes(r.estado)) byWeek[w].aprobados++;
    if (r.estado === "publicado") byWeek[w].publicados++;
  }
  return Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, s]) => ({ week, ...s }));
}

export function MetricasClient({
  rows,
  modelos,
}: {
  rows: MetricaRow[];
  modelos: { id: string; nombre: string }[];
}) {
  const [filtroModelo, setFiltroModelo] = useState("all");

  const filtered = useMemo(() =>
    filtroModelo === "all" ? rows : rows.filter((r) => r.modelo?.nombre === modelos.find((m) => m.id === filtroModelo)?.nombre),
    [rows, filtroModelo, modelos]
  );

  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const weekly = useMemo(() => computeWeekly(filtered), [filtered]);

  const totalPublicados = filtered.filter((r) => r.estado === "publicado").length;
  const totalAprobados = filtered.filter((r) => ["aprobado", "publicado"].includes(r.estado)).length;
  const totalRecibidos = filtered.length;
  const tasaGlobal = totalRecibidos > 0 ? Math.round((totalAprobados / totalRecibidos) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Filtro modelo */}
      <div className="flex gap-3">
        <select
          value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}
          className="rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-[#8B5CF6] focus:outline-none"
        >
          <option value="all">Todas las modelos</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Recibidos (90d)", value: totalRecibidos, color: "text-zinc-100" },
          { label: "Aprobados", value: totalAprobados, color: "text-green-300" },
          { label: "Publicados", value: totalPublicados, color: "text-[#A78BFA]" },
          { label: "Tasa aprobación", value: `${tasaGlobal}%`, color: totalPublicados === 0 ? "text-zinc-500" : tasaGlobal >= 70 ? "text-green-300" : "text-orange-300" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Por tipo de vídeo */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-zinc-300">Por tipo de vídeo</h2>
        {stats.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-zinc-800 text-zinc-600">
            Sin datos — conecta Supabase para ver métricas reales
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Recibidos</th>
                  <th className="px-4 py-3 text-right">Aprobados</th>
                  <th className="px-4 py-3 text-right">Publicados</th>
                  <th className="px-4 py-3 text-right">Tasa aprobación</th>
                  <th className="px-4 py-3 text-right">Días hasta aprobación</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.tipo} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="rounded bg-[#8B5CF6]/20 px-2 py-0.5 text-xs text-[#A78BFA]">
                        {tipoVideoLabel(s.tipo)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">{s.total}</td>
                    <td className="px-4 py-3 text-right text-green-300">{s.aprobados}</td>
                    <td className="px-4 py-3 text-right text-[#A78BFA]">{s.publicados}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={s.tasaAprobacion >= 70 ? "text-green-300" : s.tasaAprobacion >= 50 ? "text-yellow-300" : "text-red-300"}>
                        {s.tasaAprobacion}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {s.tiempoMedioAprobacion !== null ? `${s.tiempoMedioAprobacion}d` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evolución semanal */}
      {weekly.length > 0 && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-zinc-300">Evolución semanal</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                  <th className="px-4 py-3 text-left">Semana</th>
                  <th className="px-4 py-3 text-right">Recibidos</th>
                  <th className="px-4 py-3 text-right">Aprobados</th>
                  <th className="px-4 py-3 text-right">Publicados</th>
                </tr>
              </thead>
              <tbody>
                {weekly.slice(-12).reverse().map((w) => (
                  <tr key={w.week} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 text-zinc-400">{w.week}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{w.recibidos}</td>
                    <td className="px-4 py-3 text-right text-green-300">{w.aprobados}</td>
                    <td className="px-4 py-3 text-right text-[#A78BFA]">{w.publicados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Por modelo */}
      {filtroModelo === "all" && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-zinc-300">Por modelo</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modelos.map((m) => {
              const rs = rows.filter((r) => r.modelo?.nombre === m.nombre);
              const pub = rs.filter((r) => r.estado === "publicado").length;
              const apr = rs.filter((r) => ["aprobado", "publicado"].includes(r.estado)).length;
              const tasa = rs.length > 0 ? Math.round((apr / rs.length) * 100) : 0;
              return (
                <div key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="mb-3 font-medium text-zinc-100">{m.nombre}</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-xl font-bold text-zinc-200">{rs.length}</p>
                      <p className="text-zinc-600">Total</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-[#A78BFA]">{pub}</p>
                      <p className="text-zinc-600">Publicados</p>
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${tasa >= 70 ? "text-green-300" : "text-orange-300"}`}>{tasa}%</p>
                      <p className="text-zinc-600">Tasa</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
