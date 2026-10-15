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

/** Esquemas sencillos de como tienen que ir encuadradas la foto de perfil y la del banner (no son fotos de nadie). */
function EsquemaPerfil() {
  return (
    <svg viewBox="0 0 120 160" className="h-40 w-auto shrink-0 rounded-lg border border-white/15 bg-white/[0.04]" role="img" aria-label="Foto de perfil: vertical, cara grande y centrada">
      <ellipse cx="60" cy="62" rx="26" ry="32" fill="none" stroke="#A78BFA" strokeWidth="2.5" />
      <path d="M8 160 C8 118 34 104 60 104 C86 104 112 118 112 160" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeDasharray="4 3" />
      <circle cx="49" cy="58" r="2.5" fill="#A78BFA" />
      <circle cx="71" cy="58" r="2.5" fill="#A78BFA" />
      <text x="60" y="152" textAnchor="middle" fontSize="8" fill="#ffffff99">vertical · cara grande</text>
    </svg>
  );
}

function EsquemaBanner() {
  return (
    <svg viewBox="0 0 240 120" className="h-28 w-auto max-w-full shrink-0 rounded-lg border border-white/15 bg-white/[0.04]" role="img" aria-label="Banner: horizontal, cara a un lado y cuerpo hacia el otro">
      <ellipse cx="62" cy="52" rx="20" ry="25" fill="none" stroke="#A78BFA" strokeWidth="2.5" />
      <circle cx="54" cy="49" r="2.2" fill="#A78BFA" />
      <circle cx="70" cy="49" r="2.2" fill="#A78BFA" />
      <path d="M96 78 C130 62 170 60 232 74 L232 120 L40 120 C60 100 80 88 96 78 Z" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeDasharray="4 3" />
      <text x="120" y="14" textAnchor="middle" fontSize="8" fill="#ffffff99">horizontal · cara a un lado, sin cortarla</text>
    </svg>
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
          Para montar tu perfil necesitamos <span className="font-semibold text-white">dos fotos tuyas con muchísima calidad</span>: una de perfil y una horizontal para el banner. Tienen que verse{" "}
          <span className="font-semibold text-white">nítidas, bien iluminadas y profesionales</span>, y sobre todo se tiene que ver tu cara muy bien.
        </p>

        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="font-display text-base font-semibold text-white">1 · Foto de perfil</p>
          <div className="flex flex-wrap items-start gap-4">
            <EsquemaPerfil />
            <div className="min-w-0 flex-1 basis-60">
              <Lista
                puntos={[
                  "Vertical (tipo selfie o retrato), con la cara grande y centrada: cabeza y hombros, mirando a la cámara.",
                  "La cara tiene que verse perfecta: de frente o casi de frente, sin gafas de sol, gorra, filtros ni el pelo tapándote la cara.",
                  "Luz natural suave de frente (junto a una ventana). Nada de contraluz ni sombras duras en la cara.",
                  "Look coqueto y cuidado, con la misma cercanía y naturalidad de un selfie bien hecho.",
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="font-display text-base font-semibold text-white">2 · Foto horizontal para el banner</p>
          <div className="flex flex-wrap items-start gap-4">
            <EsquemaBanner />
            <div className="min-w-0 flex-1 basis-60">
              <Lista
                puntos={[
                  "Horizontal (apaisada), de al menos 2000 píxeles de ancho. Con el móvil en horizontal y la cámara trasera sale perfecta.",
                  "Tu cara bien visible y mirando a la cámara, colocada hacia un lado de la foto (no cortada por los bordes) y el resto de la foto con tu pose, tumbada o apoyada.",
                  "Fondo ordenado y luz buena. Que se vea cuidada, como una foto de portada.",
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-base font-semibold text-[#C4B5FD]">Las dos, con la máxima calidad</h4>
          <Lista
            puntos={[
              "Haz las fotos con la cámara trasera del móvil, bien enfocadas y sin zoom digital.",
              "Sin filtros, sin retoque y sin capturas de pantalla: queremos la foto original.",
              "Cuando las envíes a la agencia, mándalas como archivo o documento (no como foto normal de WhatsApp), para que no pierdan calidad por la compresión.",
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
