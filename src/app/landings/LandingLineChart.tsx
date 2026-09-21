"use client";

import { useMemo, useState, type PointerEvent } from "react";

export type LandingChartPoint = {
  date: string;
  pageviews: number;
  linkClicks: number;
  onlyfansClicks: number;
};

const SERIES = [
  { key: "pageviews", label: "Visitas landing", color: "#8B5CF6" },
  { key: "linkClicks", label: "Clics links", color: "#22D3EE" },
  { key: "onlyfansClicks", label: "Clics OnlyFans", color: "#F472B6" },
] as const;

function formatDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function makePath(values: number[], max: number, width: number, height: number, padding: number) {
  if (values.length === 0) return "";
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return values
    .map((value, index) => {
      const x = padding + (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
      const y = padding + innerHeight - (value / max) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LandingLineChart({ data }: { data: LandingChartPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 860;
  const height = 300;
  const padding = 34;
  const max = Math.max(1, ...data.flatMap((point) => [point.pageviews, point.linkClicks, point.onlyfansClicks]));
  const activeIndex = hoverIndex ?? data.length - 1;
  const activePoint = data[activeIndex];

  const paths = useMemo(
    () =>
      SERIES.map((series) => ({
        ...series,
        path: makePath(
          data.map((point) => point[series.key]),
          max,
          width,
          height,
          padding,
        ),
      })),
    [data, max],
  );

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (data.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (x - padding) / (width - padding * 2)));
    setHoverIndex(Math.round(ratio * (data.length - 1)));
  }

  if (data.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-white/35">Sin datos para este periodo.</div>;
  }

  const hoverX =
    padding + (data.length === 1 ? (width - padding * 2) / 2 : ((activeIndex ?? 0) / Math.max(1, data.length - 1)) * (width - padding * 2));

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-white/45">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[720px] w-full overflow-visible"
          role="img"
          aria-label="Gráfico de líneas de estadísticas de landings"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding + (height - padding * 2) * tick;
            return (
              <g key={tick}>
                <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
              </g>
            );
          })}

          {paths.map((series) => (
            <path key={series.key} d={series.path} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {hoverIndex !== null ? (
            <>
              <line x1={hoverX} x2={hoverX} y1={padding} y2={height - padding} stroke="rgba(255,255,255,0.28)" strokeDasharray="4 4" />
              {SERIES.map((series) => {
                const value = activePoint[series.key];
                const y = padding + (height - padding * 2) - (value / max) * (height - padding * 2);
                return <circle key={series.key} cx={hoverX} cy={y} r="5" fill={series.color} stroke="#050508" strokeWidth="2" />;
              })}
            </>
          ) : null}

          {data.map((point, index) => {
            if (index !== 0 && index !== data.length - 1 && index % Math.ceil(data.length / 5) !== 0) return null;
            const x = padding + (data.length === 1 ? (width - padding * 2) / 2 : (index / (data.length - 1)) * (width - padding * 2));
            return (
              <text key={point.date} x={x} y={height - 8} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="11">
                {formatDay(point.date)}
              </text>
            );
          })}
        </svg>
      </div>

      {hoverIndex !== null && activePoint ? (
        <div
          className="pointer-events-none absolute top-12 min-w-[170px] rounded-xl border border-white/[0.1] bg-[#101018]/95 p-3 text-xs shadow-2xl"
          style={{ left: `min(calc(${(hoverX / width) * 100}% + 12px), calc(100% - 190px))` }}
        >
          <p className="mb-2 font-semibold text-white">{formatDay(activePoint.date)}</p>
          {SERIES.map((series) => (
            <div key={series.key} className="flex items-center justify-between gap-5 py-0.5 text-white/65">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                {series.label}
              </span>
              <span className="font-code text-white">{activePoint[series.key]}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
