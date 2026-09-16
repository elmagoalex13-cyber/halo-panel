"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "todo", label: "Todo el tiempo" },
  { value: "mes", label: "Este mes" },
  { value: "semana", label: "Esta semana" },
];

export function PeriodoSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("periodo") ?? "todo";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "todo") params.delete("periodo");
    else params.set("periodo", value);
    const query = params.toString();
    router.push(query ? `/dashboard?${query}` : "/dashboard");
  }

  return (
    <label className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
      Aprobados / Completados:
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="input-base w-auto py-1.5 text-xs"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
