"use client";

import type { TikTokGuardado } from "@/lib/captacionPiezas";

const mb = (b: number | null) => (b ? `${Math.round(b / 1e6)} MB` : "");
const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const ETIQUETA_ESTADO: Record<string, string> = { recibido: "Guardado", editando: "Editando", en_aprobacion: "En aprobación", aprobado: "Aprobado", publicado: "Publicado", rechazado: "Descartado" };

/** Todos los TikToks que ha subido la modelo, guardados aparte de la captacion (no cuentan como reels) para no perder nunca material. */
export function TiktoksModelo({ nombre, tiktoks }: { nombre: string; tiktoks: TikTokGuardado[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-display text-lg font-semibold text-white">
          🎵 {tiktoks.length} {tiktoks.length === 1 ? "TikTok guardado" : "TikToks guardados"} de {nombre}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Los TikToks <span className="text-white/70">no cuentan como reels</span> de la captación (ni para los 30 ni para crear su cuenta de Instagram). Aquí se guardan todos para que nunca se pierda material: puedes verlos y descargar el original cuando quieras.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiktoks.map((t) => {
          const video = t.preview ?? (t.editado ? { video: t.editado, poster: undefined } : null);
          return (
            <li key={t.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="aspect-[9/16] bg-black/40">
                {video ? (
                  <video src={video.video} poster={video.poster} controls preload="none" playsInline className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center p-3 text-center text-xs text-white/35">Preparando la vista previa… (unos minutos)</div>
                )}
              </div>
              <div className="space-y-1 p-2.5">
                <p className="truncate text-xs font-semibold text-white/85">{t.archivo ?? t.titulo ?? "TikTok"}</p>
                <p className="text-[11px] text-white/40">
                  {fecha(t.recibido_at)}
                  {t.size_bytes ? ` · ${mb(t.size_bytes)}` : ""}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">{ETIQUETA_ESTADO[t.estado] ?? t.estado}</span>
                  <a href={`/api/descargar?id=${t.id}&tipo=original`} className="text-[11px] font-semibold text-[#A78BFA] hover:underline">
                    Descargar original
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
