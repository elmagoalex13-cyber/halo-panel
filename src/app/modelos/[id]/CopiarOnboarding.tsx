"use client";

import { useState } from "react";

export function CopiarOnboarding({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"idle" | "ok" | "error">("idle");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
    setTimeout(() => setEstado("idle"), 2500);
  }

  return (
    <button type="button" onClick={copiar} className="btn-secondary px-3 py-1.5 text-xs">
      {estado === "ok" ? "Copiado ✓" : estado === "error" ? "No se pudo copiar" : "Copiar todo"}
    </button>
  );
}
