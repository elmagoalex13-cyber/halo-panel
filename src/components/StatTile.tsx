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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.12] bg-gradient-to-br from-[#8B5CF6]/25 to-[#A78BFA]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          <Icon className="h-[18px] w-[18px] text-[color:var(--accent-2)]" />
        </span>
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
