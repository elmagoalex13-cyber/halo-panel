"use client";

import { useRouter } from "next/navigation";
import { SelectorAmbito, type FiltroAmbito } from "@/components/SelectorAmbito";

/** Selector del dashboard del dueño: el grupo viaja en la URL (?grupo=) y el servidor recalcula todo con ese grupo. */
export function SelectorGrupo({
  actual,
  totales,
  periodo,
  creadoras,
}: {
  actual: FiltroAmbito;
  totales: Record<FiltroAmbito, number>;
  periodo?: string;
  creadoras?: string;
}) {
  const router = useRouter();
  function cambiar(f: FiltroAmbito) {
    const q = new URLSearchParams();
    if (f !== "todas") q.set("grupo", f);
    if (periodo) q.set("periodo", periodo);
    if (creadoras) q.set("creadoras", creadoras);
    router.push(`/dashboard${q.size ? `?${q}` : ""}`);
  }
  return <SelectorAmbito esDueno valor={actual} onChange={cambiar} cuenta={(f) => totales[f]} />;
}
