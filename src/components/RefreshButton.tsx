"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshButton({ label = "Actualizar ahora" }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  function handleClick() {
    startTransition(() => {
      router.refresh();
    });
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 1500);
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40">
      <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Actualizando..." : justRefreshed ? "Actualizado" : label}
    </button>
  );
}
