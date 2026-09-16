import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  glow,
  subtitle,
  trendPct,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  glow?: "purple" | "teal";
  subtitle?: string;
  trendPct?: number;
}) {
  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[color:var(--text-secondary)]">{label}</p>
        <Icon className="h-5 w-5 text-[color:var(--accent-2)]" />
      </div>
      <p className={cn("mt-4 font-display text-3xl font-semibold", glow === "purple" && "kpi-glow-purple", glow === "teal" && "kpi-glow-teal")}>
        {value}
      </p>
      {subtitle || trendPct !== undefined ? (
        <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">
          {trendPct !== undefined ? (
            <span className={trendPct >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
              {trendPct >= 0 ? "▲" : "▼"} {Math.abs(trendPct)}%{" "}
            </span>
          ) : null}
          {subtitle}
        </p>
      ) : null}
    </GlassCard>
  );
}
