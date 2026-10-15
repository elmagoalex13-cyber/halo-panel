"use client";

import { FotoEjemplo } from "./GuiaOF";
import { SubirFotoPerfil, type FotoSubida } from "./SubirFotoPerfil";

export type FotosPerfilEstado = { perfil: FotoSubida | null; banner: FotoSubida | null };

/** Foto de perfil y foto del banner (pestaña «Fotos» de Contenido OnlyFans): foto de ejemplo ampliable + boton de subir. */
export function FotosPerfilSubida({ fotos, onCambio }: { fotos: FotosPerfilEstado; onCambio: (f: FotosPerfilEstado) => void }) {
  return (
    <div id="fotos-perfil" className="space-y-3">
      <p className="text-sm text-white/45">Dos fotos tuyas con mucha calidad y que se te vea muy bien la cara, como las de ejemplo (tócalas para verlas en grande). Hechas con el aro de luz.</p>

      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-sm font-semibold text-white">Foto de perfil <span className="font-normal text-white/45">· vertical, cara grande</span></p>
        <div className="flex items-start gap-3">
          <FotoEjemplo src="/guia/foto-perfil-ejemplo.jpg" alt="Foto de perfil de ejemplo" clase="aspect-[3/4] w-20" />
          <div className="min-w-0 flex-1">
            <SubirFotoPerfil tipo="perfil" actual={fotos.perfil} onSubida={(f) => onCambio({ ...fotos, perfil: f })} />
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-sm font-semibold text-white">Foto del banner <span className="font-normal text-white/45">· horizontal</span></p>
        <div className="flex items-start gap-3">
          <FotoEjemplo src="/guia/foto-banner-ejemplo.jpg" alt="Foto de banner de ejemplo" clase="aspect-[4/3] w-28" />
          <div className="min-w-0 flex-1">
            <SubirFotoPerfil tipo="banner" actual={fotos.banner} onSubida={(f) => onCambio({ ...fotos, banner: f })} />
          </div>
        </div>
      </div>
    </div>
  );
}
