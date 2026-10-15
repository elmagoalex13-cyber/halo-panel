"use client";

import { useState } from "react";
import { FotosPerfilModelo as Fotos } from "@/components/FotosPerfilPanel";
import type { FotosPerfilVistas } from "@/lib/fotosPerfil";

/** Tarjeta de la ficha: foto de perfil y banner que ha subido la modelo (misma gestion que en OnlyFans > Perfil y banner). */
export function FotosPerfilModelo({ modeloId, inicial }: { modeloId: string; inicial: FotosPerfilVistas }) {
  const [fotos, setFotos] = useState(inicial);
  const n = Number(Boolean(fotos.perfil)) + Number(Boolean(fotos.banner));
  return (
    <div className="card !p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">Foto de perfil y banner</h2>
        <span className={`badge ${n === 2 ? "bg-green-500/20 text-green-400" : n === 1 ? "bg-amber-500/15 text-amber-300" : ""}`}>{n === 2 ? "Completas" : n === 1 ? "Falta 1" : "Sin subir"}</span>
      </div>
      <Fotos modeloId={modeloId} fotos={fotos} onCambio={setFotos} />
    </div>
  );
}
