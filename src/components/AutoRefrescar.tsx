"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Vuelve a cargar los datos de la pagina cada cierto tiempo (solo con la pestaña a la vista y sin recargarla entera), para que lo nuevo aparezca solo. */
export function AutoRefrescar({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => window.clearInterval(t);
  }, [router, segundos]);
  return null;
}
