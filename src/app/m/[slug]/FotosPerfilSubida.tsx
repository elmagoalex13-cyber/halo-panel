"use client";

import { FotoEjemplo } from "./GuiaOF";
import { SubirFotoPerfil, type FotoSubida } from "./SubirFotoPerfil";

export type FotosPerfilEstado = { perfil: FotoSubida | null; banner: FotoSubida | null };

/** Foto de perfil y foto del banner: se suben aqui, donde se sube el contenido (con la foto de ejemplo al lado, ampliable). */
export function FotosPerfilSubida({ fotos, onCambio }: { fotos: FotosPerfilEstado; onCambio: (f: FotosPerfilEstado) => void }) {
  const n = Number(Boolean(fotos.perfil)) + Number(Boolean(fotos.banner));
  return (
    <section id="fotos-perfil" className="space-y-4 rounded-2xl border border-[#8B5CF6]/35 bg-[#8B5CF6]/[0.08] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">📸 Foto de perfil y foto de banner</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/60">Dos fotos tuyas con mucha calidad y que se te vea muy bien la cara, como estas de ejemplo (tócalas para verlas en grande). Hechas con el aro de luz.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${n === 2 ? "bg-emerald-400/20 text-emerald-300" : "bg-amber-400 text-black"}`}>{n}/2</span>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-sm font-semibold text-white">1 · Foto de perfil <span className="font-normal text-white/45">(vertical, cara grande y centrada)</span></p>
        <div className="flex flex-wrap items-start gap-3">
          <FotoEjemplo src="/guia/foto-perfil-ejemplo.jpg" alt="Foto de perfil de ejemplo" clase="aspect-[3/4] w-28" />
          <div className="min-w-0 flex-1 basis-48">
            <SubirFotoPerfil tipo="perfil" actual={fotos.perfil} onSubida={(f) => onCambio({ ...fotos, perfil: f })} />
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-sm font-semibold text-white">2 · Foto horizontal para el banner <span className="font-normal text-white/45">(con el móvil tumbado)</span></p>
        <div className="flex flex-wrap items-start gap-3">
          <FotoEjemplo src="/guia/foto-banner-ejemplo.jpg" alt="Foto de banner de ejemplo" clase="aspect-[4/3] w-40" />
          <div className="min-w-0 flex-1 basis-48">
            <SubirFotoPerfil tipo="banner" actual={fotos.banner} onSubida={(f) => onCambio({ ...fotos, banner: f })} />
          </div>
        </div>
      </div>
    </section>
  );
}
