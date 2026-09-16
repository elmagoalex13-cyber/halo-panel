"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function CreadorasFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("creadoras") === "30d" ? "30d" : "todo";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "todo") params.delete("creadoras");
    else params.set("creadoras", value);
    const query = params.toString();
    router.push(query ? `/dashboard?${query}` : "/dashboard");
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex rounded-full border border-white/10 p-0.5 text-[11px] font-semibold text-white/50"
    >
      {[
        { value: "todo", label: "Todo" },
        { value: "30d", label: "30 dias" },
      ].map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-2.5 py-1 transition ${
            current === option.value ? "bg-[#8B5CF6] text-white" : "hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
