"use client";

import { useEffect } from "react";

/** Al abrir la actividad de tu socio, lo sensible pasa a "visto" y el numerito rojo del menú desaparece. */
export function MarcarVista({ hayNuevos }: { hayNuevos: boolean }) {
  useEffect(() => {
    if (!hayNuevos) return;
    const t = window.setTimeout(() => {
      fetch("/api/panel/actividad/vista", { method: "POST" })
        .then(() => window.dispatchEvent(new Event("focus"))) // el menú vuelve a pedir sus contadores
        .catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, [hayNuevos]);
  return null;
}
