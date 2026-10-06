"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { OnlyFansClient } from "@/app/onlyfans/OnlyFansClient";
import type { ResumenColeccion } from "@/lib/ofResumen";
import { formatDate } from "@/lib/utils";

export type VideoInstagram = {
  id: string;
  titulo: string | null;
  estado: string;
  recibido_at: string;
  publicado_at: string | null;
  url: string; // video editado listo para ver
};

const ETIQUETA_ESTADO: Record<string, string> = {
  en_aprobacion: "Para revisar",
  aprobado: "Aprobado",
  publicado: "Publicado",
};

// Todo el contenido de una modelo en un sitio: lo de Instagram (videos editados) y lo de OnlyFans (scripts, packs, posts).
export function ContenidoModelo({
  modelo,
  instagram,
  onlyfans,
}: {
  modelo: { id: string; nombre: string; foto: number | null };
  instagram: VideoInstagram[];
  onlyfans: ResumenColeccion[];
}) {
  const [seccion, setSeccion] = useState<"instagram" | "onlyfans">(onlyfans.some((c) => c.nuevo) ? "onlyfans" : "instagram");
  const nuevos = onlyfans.filter((c) => c.nuevo).length;
  const tab = (activo: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm font-semibold transition ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white/80"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setSeccion("instagram")} className={tab(seccion === "instagram")}>
          Instagram <span className="text-xs opacity-60">{instagram.length}</span>
        </button>
        <button onClick={() => setSeccion("onlyfans")} className={tab(seccion === "onlyfans")}>
          OnlyFans <span className="text-xs opacity-60">{onlyfans.length}</span>
          {nuevos ? <span className="ml-1.5 rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] text-white">{nuevos} nuevo{nuevos === 1 ? "" : "s"}</span> : null}
        </button>
      </div>

      {seccion === "onlyfans" ? (
        <OnlyFansClient modelos={[modelo]} colecciones={onlyfans} sinFiltroModelo />
      ) : instagram.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center text-sm text-white/40">Todavía no hay vídeos editados de esta modelo.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {instagram.map((v) => (
            <article key={v.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5">
              <div className="aspect-[9/16] overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                <video src={v.url} controls playsInline preload="none" className="h-full w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white/70">{ETIQUETA_ESTADO[v.estado] ?? v.estado}</span>
                <span className="text-white/35">{formatDate(v.publicado_at ?? v.recibido_at)}</span>
              </div>
              {v.titulo ? <p className="truncate text-xs text-white/55" title={v.titulo}>{v.titulo}</p> : null}
              <a
                href={`/api/descargar?id=${v.id}&tipo=editado`}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 py-1.5 text-xs font-semibold text-[#A78BFA] transition hover:bg-[#8B5CF6]/20"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
