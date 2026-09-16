"use client";

import { useMemo, useState } from "react";
import { Link2, Plug, RefreshCw } from "lucide-react";
import type { CuentaIGDemo, MetricoolEstado } from "@/types";

type Periodo = "7d" | "30d" | "90d";

const ESTADO_LABEL: Record<CuentaIGDemo["estado"], string> = {
  activa: "Activa",
  sin_revisar: "sin revisar",
  pausada: "pausada",
};

const ESTADO_CLASS: Record<CuentaIGDemo["estado"], string> = {
  activa: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200",
  sin_revisar: "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200",
  pausada: "bg-red-50 text-red-500 ring-1 ring-red-200",
};

const METRICOOL_LABEL: Record<MetricoolEstado, string> = {
  conectada: "Metricool conectada",
  no_conectada: "Metricool no conectada",
  error: "Error de sincronizacion",
};

const METRICOOL_CLASS: Record<MetricoolEstado, string> = {
  conectada: "bg-sky-50 text-sky-600 ring-1 ring-sky-200",
  no_conectada: "bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200",
  error: "bg-red-50 text-red-500 ring-1 ring-red-200",
};

const CIUDAD_COLORS = ["#8B5CF6", "#06B6D4", "#F472B6", "#FB923C", "#34D399", "#94A3B8"];

function formatVisitas(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")} K`;
  return `${value}`;
}

function formatSeguidores(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function relativeDayLabel(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} d`;
}

function gananciaPorPeriodo(cuenta: CuentaIGDemo, periodo: Periodo) {
  if (periodo === "7d") return cuenta.ganancia_7d;
  if (periodo === "30d") return cuenta.ganancia_30d;
  return cuenta.ganancia_90d;
}

export function CuentasTab({ cuentas }: { cuentas: CuentaIGDemo[] }) {
  const [selectedId, setSelectedId] = useState(cuentas[0]?.id ?? null);
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const selected = cuentas.find((c) => c.id === selectedId) ?? cuentas[0] ?? null;

  const resumen = useMemo(() => {
    const totalSeguidores = cuentas.reduce((sum, c) => sum + c.seguidores, 0);
    const totalGanancia = cuentas.reduce((sum, c) => sum + gananciaPorPeriodo(c, periodo), 0);
    const totalHombres = cuentas.reduce((sum, c) => sum + c.demografia.pct_hombres * c.seguidores, 0);
    const pctHombres = totalSeguidores ? Math.round(totalHombres / totalSeguidores) : 0;
    return { totalSeguidores, totalGanancia, pctHombres };
  }, [cuentas, periodo]);

  if (!selected) {
    return <p className="text-sm text-[color:var(--text-muted)]">Sin cuentas de Instagram activas.</p>;
  }

  const reels = selected.reels.filter((reel) => !reel.es_trial);
  const trials = selected.reels.filter((reel) => reel.es_trial);
  const growth = gananciaPorPeriodo(selected, periodo);
  const periodoDias = periodo === "7d" ? "7" : periodo === "30d" ? "30" : "90";

  return (
    <div className="overflow-hidden rounded-3xl bg-white text-neutral-900 shadow-xl ring-1 ring-black/5">
      {/* Summary bar */}
      <div className="border-b border-neutral-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">Las cuentas, hoy</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              {cuentas.length} cuenta{cuentas.length === 1 ? "" : "s"} · ultimos {periodoDias} dias ·{" "}
              {formatSeguidores(resumen.totalSeguidores)} seguidores en la casa{" "}
              <span className="font-semibold text-emerald-600">+{formatSeguidores(resumen.totalGanancia)}</span> ·{" "}
              {resumen.pctHombres}% hombres
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-neutral-200 p-0.5 text-xs font-semibold text-neutral-500">
              {(["7d", "30d", "90d"] as Periodo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`rounded-full px-3 py-1 transition ${
                    periodo === p ? "bg-neutral-900 text-white" : "hover:text-neutral-900"
                  }`}
                >
                  {p.replace("d", " d")}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-900">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>
        </div>

        {/* Account switcher */}
        <div className="mt-4 flex flex-wrap gap-2">
          {cuentas.map((cuenta) => {
            const active = cuenta.id === selected.id;
            return (
              <button
                key={cuenta.id}
                onClick={() => setSelectedId(cuenta.id)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-white text-neutral-500"
                  }`}
                >
                  {cuenta.username.slice(0, 1).toUpperCase()}
                </span>
                @{cuenta.username}
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile + demographics */}
      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <div className="flex items-start gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 font-display text-2xl font-semibold text-neutral-400">
              {selected.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-semibold text-neutral-900">@{selected.username}</span>
                <Link2 className="h-3.5 w-3.5 text-neutral-300" />
                {selected.tag ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{selected.tag}</span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
                <span>
                  <b className="text-neutral-900">{selected.publicaciones}</b> publicaciones
                </span>
                <span>
                  <b className="text-neutral-900">{formatSeguidores(selected.seguidores)}</b> seguidores{" "}
                  <span className="font-semibold text-emerald-600">
                    +{formatSeguidores(growth)} {periodoDias}d
                  </span>
                </span>
                <span>
                  <b className="text-neutral-900">{selected.seguidos}</b> seguidos
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-0.5 text-sm text-neutral-600">
            <p className="font-semibold text-neutral-900">{selected.modelo_nombre}</p>
            {selected.bio.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_CLASS[selected.estado]}`}>
              {ESTADO_LABEL[selected.estado]}
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500 ring-1 ring-neutral-200">
              sin revisar hoy
            </span>
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                METRICOOL_CLASS[selected.metricool_estado ?? "no_conectada"]
              }`}
            >
              <Plug className="h-3 w-3" /> {METRICOOL_LABEL[selected.metricool_estado ?? "no_conectada"]}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-4">
          <p className="text-sm font-semibold text-neutral-900">Quien la sigue</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="font-display text-2xl font-bold text-neutral-900">{selected.demografia.pct_mujeres}%</span>
            <div className="flex-1">
              <div className="flex h-2 overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full bg-[#8B5CF6]" style={{ width: `${selected.demografia.pct_mujeres}%` }} />
                <div className="h-full bg-neutral-300" style={{ width: `${selected.demografia.pct_hombres}%` }} />
              </div>
              <p className="mt-1 text-xs text-neutral-400">sin clasificar por Instagram (no son mujeres)</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {selected.demografia.tramos.map((tramo) => (
              <div key={tramo.rango} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-neutral-500">{tramo.rango}</span>
                <div className="h-1.5 flex-1 rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-[#A78BFA]" style={{ width: `${tramo.pct}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-semibold text-neutral-700">
                  {tramo.pct % 1 === 0 ? tramo.pct : tramo.pct.toFixed(1).replace(".", ",")}%
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
            {selected.demografia.ciudades.map((ciudad, i) => (
              <span key={ciudad.ciudad} className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: CIUDAD_COLORS[i % CIUDAD_COLORS.length] }} />
                {ciudad.pct % 1 === 0 ? ciudad.pct : ciudad.pct.toFixed(1).replace(".", ",")}%
              </span>
            ))}
          </div>

          <button className="mt-3 text-xs font-semibold text-[#8B5CF6] hover:underline">
            » todos los tramos y las ciudades
          </button>

          <div className="mt-3 flex flex-wrap justify-between gap-1 text-[11px] text-neutral-400">
            <span>Demografia del {new Date(selected.demografia.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
            <span>seguidores del {selected.demografia.fecha}</span>
          </div>
        </div>
      </div>

      {/* Reels grid */}
      <div className="border-t border-neutral-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-neutral-900">Ultimos reels</h3>
          <p className="text-xs text-neutral-400">
            {selected.reels_30d_count} en 30 d · {selected.reels_7d_count} en 7 d · mediana {formatVisitas(selected.mediana_visitas)} visitas
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {reels.map((reel) => (
            <ReelCard key={reel.id} thumbnail={reel.thumbnail_url} visitas={reel.visitas} fecha={reel.fecha} />
          ))}
        </div>
      </div>

      {/* Trials */}
      <div className="border-t border-neutral-100 p-5 sm:p-6">
        <h3 className="font-display text-base font-semibold text-neutral-900">Trials</h3>
        {trials.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {trials.map((reel) => (
              <ReelCard key={reel.id} thumbnail={reel.thumbnail_url} visitas={reel.visitas} fecha={reel.fecha} trial />
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-400">
            <p>Ningun trial con visitas en 30 dias</p>
            <p>Ningun trial todavia.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReelCard({ thumbnail, visitas, fecha, trial }: { thumbnail: string; visitas: number; fecha: string; trial?: boolean }) {
  return (
    <div>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail} alt="Reel thumbnail" className="h-full w-full object-cover" />
        {trial ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600 ring-1 ring-black/5">
            Trial
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-neutral-900">{formatVisitas(visitas)} visitas</p>
      <p className="text-[11px] text-neutral-400">{relativeDayLabel(fecha)}</p>
    </div>
  );
}
