"use client";

import { useState, type ReactNode } from "react";
import { GUIA_SCRIPT } from "@/lib/guiaOF";

export type ReferenciaVista = { id: string; categoria: "post" | "pack" | "script_ejemplo"; titulo: string | null; tipo_archivo: "foto" | "video"; vista: string | null };

function Bloque({ titulo, abierto = false, children }: { titulo: string; abierto?: boolean; children: ReactNode }) {
  const [on, setOn] = useState(abierto);
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOn((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left" aria-expanded={on}>
        <h2 className="font-display text-lg font-semibold text-white">{titulo}</h2>
        <span className="text-white/45">{on ? "▲" : "▼"}</span>
      </button>
      {on ? <div className="space-y-4 border-t border-white/[0.08] px-4 pb-5 pt-4">{children}</div> : null}
    </section>
  );
}

function Lista({ puntos }: { puntos: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {puntos.map((p) => (
        <li key={p} className="flex gap-2 text-[15px] leading-relaxed text-white/80">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A78BFA]" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

function Galeria({ items }: { items: ReferenciaVista[] }) {
  const [grande, setGrande] = useState<ReferenciaVista | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((r) => (
          <figure key={r.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <div className="aspect-[3/4]">
              {r.vista ? (
                r.tipo_archivo === "video" ? (
                  <video src={r.vista} controls playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.vista} alt={r.titulo ?? "Referencia"} loading="lazy" onClick={() => setGrande(r)} className="h-full w-full cursor-zoom-in object-cover" />
                )
              ) : null}
            </div>
            {r.titulo ? <figcaption className="px-2.5 py-2 text-xs leading-snug text-white/65">{r.titulo}</figcaption> : null}
          </figure>
        ))}
      </div>
      {grande?.vista ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-3" onClick={() => setGrande(null)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande.vista} alt={grande.titulo ?? "Referencia"} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      ) : null}
    </>
  );
}

/** Foto de referencia de perfil/banner: se ve pequeña y al tocarla se amplia (para verla bien). */
function FotoEjemplo({ src, alt, clase }: { src: string; alt: string; clase: string }) {
  const [grande, setGrande] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setGrande(true)} aria-label={`Ampliar: ${alt}`} className={`group relative shrink-0 cursor-zoom-in overflow-hidden rounded-xl border border-white/15 bg-black/30 ${clase}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white/85">🔍 Ampliar</span>
      </button>
      {grande ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-3" onClick={() => setGrande(false)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" />
          <button type="button" onClick={() => setGrande(false)} aria-label="Cerrar" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-xl text-white">
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}

const lineas = (t: string) => t.split("\n").map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);

/** Guía para las modelos: scripts (texto fijo, tal cual el documento), packs y posts (textos que edita la agencia) y fotos/vídeos de ejemplo. */
export function GuiaOF({ packs, posts, referencias }: { packs: string; posts: string; referencias: ReferenciaVista[] }) {
  const g = GUIA_SCRIPT;
  const de = (c: ReferenciaVista["categoria"]) => referencias.filter((r) => r.categoria === c);
  const textoPacks = lineas(packs);
  const textoPosts = lineas(posts);

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-4 py-3 text-sm leading-relaxed text-white/75">
        <span className="font-semibold text-white">Esta guía es solo para el contenido de OnlyFans</span> (scripts, packs de fotos y posts). Los reels de tu Instagram no siguen estas indicaciones. Síguela{" "}
        <span className="font-semibold text-white">exactamente como está escrita</span>: la duración de los vídeos y la cantidad de fotos y vídeos de cada fase tienen que ser las que se piden, sin cambiar nada.
      </p>

      <Bloque titulo="🤳 Foto de perfil y foto de banner" abierto>
        <p className="text-[15px] leading-relaxed text-white/80">
          Necesitamos <span className="font-semibold text-white">dos fotos tuyas</span> para tu perfil: una de perfil y una horizontal para el banner. Tienen que verse{" "}
          <span className="font-semibold text-white">con mucha calidad y que se te vea muy bien la cara</span>. Tienen que ser{" "}
          <span className="font-semibold text-white">como estas de ejemplo</span> (toca cada foto para verla en grande).
        </p>

        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="font-display text-base font-semibold text-white">1 · Foto de perfil</p>
          <div className="flex flex-wrap items-start gap-4">
            <FotoEjemplo src="/guia/foto-perfil-ejemplo.jpg" alt="Foto de perfil de ejemplo" clase="aspect-[3/4] w-40 sm:w-48" />
            <div className="min-w-0 flex-1 basis-56">
              <Lista
                puntos={[
                  "Vertical, tipo selfie, con tu cara grande y bien centrada.",
                  "Se tiene que ver muy bien la cara: de frente, mirando a la cámara.",
                  "Con buena luz, mejor luz natural de frente (junto a una ventana).",
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="font-display text-base font-semibold text-white">2 · Foto horizontal para el banner</p>
          <div className="flex flex-wrap items-start gap-4">
            <FotoEjemplo src="/guia/foto-banner-ejemplo.jpg" alt="Foto de banner de ejemplo" clase="aspect-[4/3] w-full max-w-sm" />
            <div className="min-w-0 flex-1 basis-56">
              <Lista
                puntos={[
                  "Horizontal (con el móvil tumbado).",
                  "Tu cara bien visible y mirando a la cámara, sin que se corte por los bordes.",
                  "Con buena luz y el fondo ordenado.",
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-base font-semibold text-[#C4B5FD]">Las dos tienen que verse con mucha calidad</h4>
          <Lista
            puntos={[
              "Hechas con el móvil, bien enfocadas, sin filtros y sin capturas de pantalla.",
              "Cuando las envíes a la agencia, mándalas como archivo o documento (no como foto normal de WhatsApp), para que no pierdan calidad.",
            ]}
          />
        </div>
      </Bloque>

      <Bloque titulo="🎬 Guía de scripts">
        <h3 className="font-display text-xl font-semibold text-white">{g.titulo}</h3>

        <div className="space-y-2">
          <h4 className="text-base font-semibold text-[#C4B5FD]">{g.queEs.titulo}</h4>
          {g.queEs.parrafos.map((p) => (
            <p key={p} className="text-[15px] leading-relaxed text-white/80">
              {p}
            </p>
          ))}
        </div>

        <div className="space-y-2">
          <h4 className="text-base font-semibold text-[#C4B5FD]">{g.dondeGrabar.titulo}</h4>
          {g.dondeGrabar.parrafos.map((p) => (
            <p key={p} className="text-[15px] leading-relaxed text-white/80">
              {p}
            </p>
          ))}
        </div>

        <div className="space-y-3">
          <h4 className="text-base font-semibold text-[#C4B5FD]">{g.estructura.titulo}</h4>
          <p className="text-[15px] leading-relaxed text-white/80">{g.estructura.intro}</p>
          <div className="space-y-3">
            {g.estructura.fases.map((f) => (
              <div key={f.titulo} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="font-display text-base font-semibold text-white">{f.titulo}</p>
                <p className="mt-1 inline-block rounded-full bg-[#8B5CF6]/20 px-3 py-1 text-sm font-semibold text-[#DDD6FE]">{f.resumen}</p>
                <div className="mt-3">
                  <Lista puntos={f.puntos} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-base font-semibold text-[#C4B5FD]">{g.indicaciones.titulo}</h4>
          <Lista puntos={g.indicaciones.puntos} />
        </div>

        {de("script_ejemplo").length ? (
          <div className="space-y-2">
            <h4 className="text-base font-semibold text-[#C4B5FD]">{g.ejemplos}</h4>
            <Galeria items={de("script_ejemplo")} />
          </div>
        ) : null}
      </Bloque>

      <Bloque titulo="📸 Packs de fotos">
        {textoPacks.length ? <Lista puntos={textoPacks} /> : <p className="text-sm text-white/50">Las indicaciones de los packs de fotos estarán aquí muy pronto.</p>}
        <Galeria items={de("pack")} />
      </Bloque>

      <Bloque titulo="🖼 Posts de OnlyFans">
        {textoPosts.length ? <Lista puntos={textoPosts} /> : <p className="text-sm text-white/50">Mira los ejemplos de abajo para hacerte una idea de cómo tienen que ser tus posts.</p>}
        {de("post").length ? (
          <>
            <p className="text-sm font-semibold text-white/70">Posts de referencia</p>
            <Galeria items={de("post")} />
          </>
        ) : (
          <p className="text-sm text-white/40">Todavía no hay posts de referencia.</p>
        )}
      </Bloque>
    </div>
  );
}
