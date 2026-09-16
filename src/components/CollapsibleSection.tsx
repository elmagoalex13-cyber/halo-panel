"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  headerRight,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex w-full items-center justify-between gap-3 p-5">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
          <span className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            {icon}
            {title}
          </span>
        </button>
        <div className="flex items-center gap-3">
          {headerRight}
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Colapsar" : "Expandir"}>
            <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {open ? <div className="border-t border-white/[0.08] p-5">{children}</div> : null}
    </div>
  );
}
