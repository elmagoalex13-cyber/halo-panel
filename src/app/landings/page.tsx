import { BarChart3, CalendarDays, MousePointerClick, Percent, Users } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { StatTile } from "@/components/StatTile";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { LandingEvent, LandingStats } from "@/types";
import { IntegrationPanel } from "./IntegrationPanel";
import { LandingLineChart, type LandingChartPoint } from "./LandingLineChart";
import { LandingsFilterForm } from "./LandingsFilterForm";

export const dynamic = "force-dynamic";

type Search = {
  landing?: string;
  from?: string;
  to?: string;
  period?: string;
  eventType?: string;
  label?: string;
};

type ReferrerMetric = {
  referrer: string;
  visits: number;
};

type LandingsData = {
  landings: LandingStats[];
  events: LandingEvent[];
};

const DAY_MS = 24 * 3600000;
const PERIODS = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
  { value: "custom", label: "Personalizado" },
] as const;

function toDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function isValidDateInput(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getResolvedDates(params: Search) {
  const today = toDateInput(new Date());
  const yesterday = toDateInput(new Date(Date.now() - DAY_MS));
  const period = params.period === "today" || params.period === "yesterday" || params.period === "7d" || params.period === "90d" || params.period === "custom" ? params.period : "30d";

  if (period === "today") {
    return { period, from: today, to: today };
  }

  if (period === "yesterday") {
    return { period, from: yesterday, to: yesterday };
  }

  if (period === "7d") {
    return { period, from: toDateInput(new Date(Date.now() - 6 * DAY_MS)), to: today };
  }

  if (period === "90d") {
    return { period, from: toDateInput(new Date(Date.now() - 89 * DAY_MS)), to: today };
  }

  if (period === "custom") {
    const from = isValidDateInput(params.from) ? params.from! : toDateInput(new Date(Date.now() - 29 * DAY_MS));
    const to = isValidDateInput(params.to) ? params.to! : today;
    return { period, from, to };
  }

  return { period, from: toDateInput(new Date(Date.now() - 29 * DAY_MS)), to: today };
}

async function loadLandingsData(filters: Required<Search>): Promise<LandingsData> {
  if (!canUseSupabase()) return { landings: [], events: [] };

  try {
    const supabase = createAdminClient();
    const eventsQuery = supabase
      .from("landing_events")
      .select("*")
      .gte("occurred_at", `${filters.from}T00:00:00.000Z`)
      .lte("occurred_at", `${filters.to}T23:59:59.999Z`)
      .order("occurred_at", { ascending: false })
      .limit(1000);

    if (filters.landing !== "all") eventsQuery.eq("landing_slug", filters.landing);
    if (filters.eventType !== "all") eventsQuery.eq("event_type", filters.eventType);
    if (filters.label) eventsQuery.ilike("label", `%${filters.label}%`);

    const [landingsResult, eventsResult] = await Promise.all([
      supabase.from("landing_stats").select("*").order("visitas_totales", { ascending: false }),
      eventsQuery,
    ]);

    return {
      landings: ((landingsResult.data ?? []) as LandingStats[]).map((landing) => ({
        ...landing,
        visitas_totales: Number(landing.visitas_totales ?? 0),
        visitantes_unicos: Number(landing.visitantes_unicos ?? 0),
        clicks_onlyfans: Number(landing.clicks_onlyfans ?? 0),
        conversion_rate: Number(landing.conversion_rate ?? 0),
      })),
      events: (eventsResult.data ?? []) as LandingEvent[],
    };
  } catch {
    return { landings: [], events: [] };
  }
}

function isOnlyFansClick(event: LandingEvent) {
  if (event.event_type !== "click") return false;
  const destination = event.destination?.toLowerCase() ?? "";
  const label = event.label?.toLowerCase() ?? "";
  return destination.includes("onlyfans") || label.includes("onlyfans") || label === "of" || label.includes("of ");
}

function isLinksPageClick(event: LandingEvent) {
  if (event.event_type !== "click" || isOnlyFansClick(event)) return false;
  const destination = event.destination?.toLowerCase() ?? "";
  const label = event.label?.toLowerCase() ?? "";
  return destination.includes("links.html") || label.includes("links") || label.includes("acceder");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function getDailyMetrics(events: LandingEvent[], from: string, to: string): LandingChartPoint[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const days = Math.max(1, Math.min(90, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1));
  const map = new Map<string, LandingChartPoint>();

  for (let i = 0; i < days; i += 1) {
    const date = toDateInput(new Date(start.getTime() + i * DAY_MS));
    map.set(date, { date, pageviews: 0, linkClicks: 0, onlyfansClicks: 0 });
  }

  events.forEach((event) => {
    const day = toDateInput(new Date(event.occurred_at));
    const metric = map.get(day);
    if (!metric) return;
    if (event.event_type === "pageview") metric.pageviews += 1;
    if (isLinksPageClick(event)) metric.linkClicks += 1;
    if (isOnlyFansClick(event)) metric.onlyfansClicks += 1;
  });

  return Array.from(map.values());
}

function getReferrers(events: LandingEvent[]): ReferrerMetric[] {
  const counts = new Map<string, number>();
  events
    .filter((event) => event.event_type === "pageview")
    .forEach((event) => {
      const raw = event.referrer || "Directo / sin referrer";
      let label = raw;
      try {
        label = raw.startsWith("http") ? new URL(raw).hostname : raw;
      } catch {
        label = raw;
      }
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

  return Array.from(counts.entries())
    .map(([referrer, visits]) => ({ referrer, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);
}

function getEndpointUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return `${siteUrl.replace(/\/$/, "")}/api/landing-track`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/landing-track`;
  return "/api/landing-track";
}

export default async function LandingsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const dateFilters = getResolvedDates(params);
  const filters: Required<Search> = {
    landing: params.landing || "all",
    from: dateFilters.from,
    to: dateFilters.to,
    period: dateFilters.period,
    eventType: params.eventType === "pageview" || params.eventType === "click" ? params.eventType : "all",
    label: params.label?.trim() ?? "",
  };

  const { landings, events } = await loadLandingsData(filters);
  const pageviews = events.filter((event) => event.event_type === "pageview").length;
  const uniqueSessions = new Set(events.filter((event) => event.event_type === "pageview").map((event) => event.session_id)).size;
  const linkClicks = events.filter(isLinksPageClick).length;
  const onlyfansClicks = events.filter(isOnlyFansClick).length;
  const conversion = pageviews ? (onlyfansClicks / pageviews) * 100 : 0;
  const daily = getDailyMetrics(events, filters.from, filters.to);
  const referrers = getReferrers(events);
  const maxLandingVisits = Math.max(1, ...landings.map((landing) => landing.visitas_totales));
  const maxReferrerVisits = Math.max(1, ...referrers.map((referrer) => referrer.visits));
  const endpointUrl = getEndpointUrl();
  const selectedLanding = landings.find((landing) => landing.slug === filters.landing) ?? landings[0];
  const selectedLandingIntegration = selectedLanding ?? {
    slug: "rachel-sweet",
    landing_key: "lk_rachel_sweet_cambia_esto",
    public_url: "https://www.rachelsweet.click/",
  };
  const periodLabel = PERIODS.find((period) => period.value === filters.period)?.label ?? "Últimos 30 días";

  return (
    <PanelLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Tracking real de landings externas</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Landings</h1>
        </div>
      </div>

      <LandingsFilterForm landings={landings.map((landing) => ({ nombre: landing.nombre, slug: landing.slug }))} filters={filters} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Visitas landing" value={formatNumber(pageviews)} icon={BarChart3} subtitle={`${periodLabel} · ${filters.from} - ${filters.to}`} />
        <StatTile label="Visitantes únicos" value={formatNumber(uniqueSessions)} icon={Users} subtitle="sesiones con pageview" />
        <StatTile label="Clics links" value={formatNumber(linkClicks)} icon={MousePointerClick} subtitle="todos los botones trackeados" />
        <StatTile label="Clics OnlyFans" value={formatNumber(onlyfansClicks)} icon={MousePointerClick} glow="teal" subtitle="clicks filtrados" />
        <StatTile label="Conversión" value={formatPercent(conversion)} icon={Percent} glow="purple" subtitle="visita -> click OF" />
      </div>

      <GlassCard className="mt-6 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Evolución</h2>
            <p className="mt-1 text-sm text-white/40">Visitas a landing, clics a links y clics a OnlyFans. Pasa el cursor por la línea.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/50">
            <CalendarDays className="h-3.5 w-3.5" />
            {filters.from === filters.to ? filters.from : `${filters.from} - ${filters.to}`}
          </span>
        </div>
        <LandingLineChart data={daily} />
      </GlassCard>

      <GlassCard className="mt-6 overflow-hidden">
        <div className="border-b border-white/[0.08] p-5">
          <h2 className="font-display text-xl font-semibold text-white">Tabla de landings</h2>
          <p className="mt-1 text-sm text-white/40">Totales históricos por landing registrada.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-white/30">
                <th className="px-5 py-3">Landing</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">URL pública</th>
                <th className="px-5 py-3 text-right">Visitas</th>
                <th className="px-5 py-3 text-right">Únicos</th>
                <th className="px-5 py-3 text-right">Clics OF</th>
                <th className="px-5 py-3 text-right">Ratio</th>
                <th className="px-5 py-3 text-right">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {landings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-white/35">
                    Sin landings todavía. Crea filas en la tabla landings y empieza a enviar eventos.
                  </td>
                </tr>
              ) : null}
              {landings.map((landing) => (
                <tr key={landing.id}>
                  <td className="px-5 py-3 font-semibold text-white">{landing.nombre}</td>
                  <td className="px-5 py-3 font-code text-white/70">{landing.slug}</td>
                  <td className="max-w-[260px] truncate px-5 py-3 text-white/55">
                    <a href={landing.public_url} target="_blank" rel="noreferrer" className="hover:text-white">
                      {landing.public_url}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-right text-white/80">{formatNumber(landing.visitas_totales)}</td>
                  <td className="px-5 py-3 text-right text-white/80">{formatNumber(landing.visitantes_unicos)}</td>
                  <td className="px-5 py-3 text-right text-white/80">{formatNumber(landing.clicks_onlyfans)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-[#A78BFA]">{formatPercent(landing.conversion_rate)}</td>
                  <td className="px-5 py-3 text-right text-white/45">{formatDateTime(landing.ultima_actividad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassCard className="p-5">
          <h2 className="font-display text-lg font-semibold text-white">Top landings</h2>
          <div className="mt-5 space-y-4">
            {landings.slice(0, 8).map((landing) => (
              <div key={landing.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-semibold text-white">{landing.nombre}</span>
                  <span className="font-code text-xs text-white/45">{formatNumber(landing.visitas_totales)}</span>
                </div>
                <ChartBar value={landing.visitas_totales} max={maxLandingVisits} color="bg-[#8B5CF6]" />
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <GlassCard className="p-5">
          <h2 className="font-display text-lg font-semibold text-white">Fuentes / referrer</h2>
          <div className="mt-5 space-y-4">
            {referrers.length === 0 ? <p className="text-sm text-white/35">Sin referrers en el rango seleccionado.</p> : null}
            {referrers.map((referrer) => (
              <div key={referrer.referrer}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-white/80">{referrer.referrer}</span>
                  <span className="font-code text-xs text-white/45">{formatNumber(referrer.visits)}</span>
                </div>
                <ChartBar value={referrer.visits} max={maxReferrerVisits} color="bg-[#22D3EE]" />
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/[0.08] p-5">
            <h2 className="font-display text-lg font-semibold text-white">Eventos recientes</h2>
            <p className="mt-1 text-sm text-white/40">Filtrables por landing, fecha, tipo y botón clicado.</p>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-[#0b0912]/95 text-xs uppercase tracking-wider text-white/30 backdrop-blur-xl">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Landing</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Label</th>
                  <th className="px-5 py-3">Destino</th>
                  <th className="px-5 py-3">Referrer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-white/35">
                      Sin eventos para estos filtros.
                    </td>
                  </tr>
                ) : null}
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-white/45">{formatDateTime(event.occurred_at)}</td>
                    <td className="px-5 py-3 font-code text-white/65">{event.landing_slug}</td>
                    <td className="px-5 py-3">
                      <span className={`badge ${event.event_type === "click" ? "badge-aprobacion" : ""}`}>{event.event_type}</span>
                    </td>
                    <td className="px-5 py-3 text-white/70">{event.label ?? "-"}</td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-white/45">{event.destination ?? "-"}</td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-white/45">{event.referrer ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      <IntegrationPanel
        endpointUrl={endpointUrl}
        slug={selectedLandingIntegration.slug}
        landingKey={selectedLandingIntegration.landing_key}
        publicUrl={selectedLandingIntegration.public_url}
      />
    </PanelLayout>
  );
}

function ChartBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = Math.max(value > 0 ? 4 : 0, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
