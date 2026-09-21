"use client";

import { useState } from "react";
import { Filter } from "lucide-react";

type LandingOption = {
  nombre: string;
  slug: string;
};

type LandingsFilterFormProps = {
  landings: LandingOption[];
  filters: {
    landing: string;
    period: string;
    from: string;
    to: string;
    eventType: string;
    label: string;
  };
};

const PERIODS = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
  { value: "custom", label: "Personalizado" },
] as const;

export function LandingsFilterForm({ landings, filters }: LandingsFilterFormProps) {
  const [period, setPeriod] = useState(filters.period);
  const isCustom = period === "custom";

  return (
    <form
      className={`mb-6 grid gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 ${
        isCustom ? "md:grid-cols-6" : "md:grid-cols-[1.1fr_1.1fr_1fr_1.4fr_auto]"
      }`}
      action="/landings"
    >
      <label className="text-xs font-semibold text-white/45">
        Landing
        <select name="landing" defaultValue={filters.landing} className="input-base mt-1">
          <option value="all">Todas</option>
          {landings.map((landing) => (
            <option key={landing.slug} value={landing.slug}>
              {landing.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs font-semibold text-white/45">
        Periodo
        <select name="period" value={period} onChange={(event) => setPeriod(event.target.value)} className="input-base mt-1">
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {isCustom ? (
        <>
          <label className="text-xs font-semibold text-white/45">
            Desde
            <input type="date" name="from" defaultValue={filters.from} className="input-base mt-1" />
          </label>
          <label className="text-xs font-semibold text-white/45">
            Hasta
            <input type="date" name="to" defaultValue={filters.to} className="input-base mt-1" />
          </label>
        </>
      ) : null}

      <label className="text-xs font-semibold text-white/45">
        Evento
        <select name="eventType" defaultValue={filters.eventType} className="input-base mt-1">
          <option value="all">Todos</option>
          <option value="pageview">Pageview</option>
          <option value="click">Click</option>
        </select>
      </label>

      <label className="text-xs font-semibold text-white/45">
        Botón / label
        <input name="label" defaultValue={filters.label} placeholder="onlyfans, header..." className="input-base mt-1" />
      </label>

      <div className="flex items-end">
        <button className="btn-primary inline-flex h-10 w-full items-center justify-center gap-2 px-4 md:w-10 md:px-0" type="submit" aria-label="Filtrar">
          <Filter className="h-4 w-4" />
          <span className="md:hidden">Filtrar</span>
        </button>
      </div>
    </form>
  );
}
