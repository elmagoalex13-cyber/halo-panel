import type { FotoPerfilVista } from "@/lib/fotosPerfil";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const tamano = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Una({ titulo, foto, clase }: { titulo: string; foto: FotoPerfilVista | null; clase: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-halo-subtle">{titulo}</p>
      {foto ? (
        <>
          <a href={foto.vista} target="_blank" rel="noreferrer" title="Ver en grande" className={`block overflow-hidden rounded-lg border border-halo-border bg-black/30 ${clase}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.vista} alt={titulo} loading="lazy" className="h-full w-full object-cover" />
          </a>
          <p className="text-[11px] text-white/45">Subida el {fecha(foto.at)} · {tamano(foto.size)}</p>
          <div className="flex gap-3 text-xs font-semibold">
            <a href={foto.vista} target="_blank" rel="noreferrer" className="text-[#A78BFA] hover:underline">Ver en grande</a>
            <a href={foto.descarga} className="text-[#A78BFA] hover:underline">Descargar original</a>
          </div>
        </>
      ) : (
        <div className={`grid place-items-center rounded-lg border border-dashed border-halo-border px-2 text-center text-xs text-white/35 ${clase}`}>Pendiente de subir</div>
      )}
    </div>
  );
}

/** Foto de perfil y foto del banner que ha subido la modelo desde su portal (la original, sin recomprimir). */
export function FotosPerfilModelo({ perfil, banner }: { perfil: FotoPerfilVista | null; banner: FotoPerfilVista | null }) {
  const n = Number(Boolean(perfil)) + Number(Boolean(banner));
  return (
    <div className="card !p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">Foto de perfil y banner</h2>
        <span className={`badge ${n === 2 ? "bg-green-500/20 text-green-400" : n === 1 ? "bg-amber-500/15 text-amber-300" : ""}`}>{n === 2 ? "Completas" : n === 1 ? "Falta 1" : "Sin subir"}</span>
      </div>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Una titulo="Perfil" foto={perfil} clase="aspect-[3/4] w-28" />
        <Una titulo="Banner" foto={banner} clase="aspect-[4/3] w-full max-w-[14rem]" />
      </div>
    </div>
  );
}
