"use client";

import { useRouter } from "next/navigation";
import { SubirBoton } from "./SubirBoton";

export type Referencia = {
  id: string;
  video: string | null;
  thumb: string | null;
  instagram: string | null;
  descripcion: string | null;
};
export type ReferenciaBanco = Referencia;
export type Pendiente = {
  id: string;
  tipo: number;
  instrucciones: string | null;
  fecha_limite: string | null;
  referencia: Referencia | null;
};
export type Entrega = {
  id: string;
  titulo: string | null;
  tipo: number | null;
  estado: string;
  estado_procesamiento: string | null;
  recibido_at: string;
};

const TIPOS = [
  { tipo: 1, titulo: "Hablando", desc: "Grabate hablando a camara. Le pondremos los subtitulos." },
  { tipo: 2, titulo: "Caption / Gesto", desc: "Un gesto o escena corta. Nosotros anadimos la frase." },
  { tipo: 3, titulo: "Reto", desc: "Graba tu version de un reto o tendencia." },
];
const NOMBRE_TIPO: Record<number, string> = { 1: "Hablando", 2: "Caption / Gesto", 3: "Reto", 4: "Con referencia" };

function estadoEntrega(e: Entrega) {
  if (e.estado === "aprobado" || e.estado === "publicado") return { texto: "Aprobado", cls: "bg-emerald-500/15 text-emerald-300" };
  if (e.estado === "rechazado") return { texto: "Descartado", cls: "bg-red-500/15 text-red-300" };
  if (e.estado === "en_aprobacion") return { texto: "En revision", cls: "bg-cyan-500/15 text-cyan-300" };
  if (e.estado_procesamiento === "error") return { texto: "Hubo un problema", cls: "bg-red-500/15 text-red-300" };
  return { texto: "Editando", cls: "bg-amber-500/15 text-amber-300" };
}

function VideoReferencia({ r }: { r: Referencia }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
      {r.video ? (
        <video
          src={r.video}
          poster={r.thumb ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="mx-auto aspect-[9/16] max-h-[60vh] w-full object-contain"
        />
      ) : (
        <div className="grid aspect-[9/16] max-h-[40vh] w-full place-items-center p-4 text-center text-sm text-white/40">
          {r.instagram ? (
            <a href={r.instagram} target="_blank" rel="noreferrer" className="text-[#A78BFA] underline">
              Ver la referencia en Instagram
            </a>
          ) : (
            "Sin video de referencia"
          )}
        </div>
      )}
    </div>
  );
}

function Seccion({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">{titulo}</h2>
        {sub ? <p className="text-sm text-white/40">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PortalClient({
  nombre,
  pendientes,
  banco,
  entregas,
}: {
  nombre: string;
  slug: string;
  pendientes: Pendiente[];
  banco: ReferenciaBanco[];
  entregas: Entrega[];
}) {
  const router = useRouter();

  async function salir() {
    await fetch("/api/portal/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/40">Hola</p>
          <h1 className="font-display text-2xl font-semibold text-white">{nombre}</h1>
        </div>
        <button onClick={salir} className="btn-secondary px-3 py-2 text-xs">
          Salir
        </button>
      </header>

      <Seccion
        titulo={`Tus videos pendientes${pendientes.length ? ` (${pendientes.length})` : ""}`}
        sub="Videos que te hemos asignado. Mira la referencia y sube tu version."
      >
        {pendientes.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/40">
            No tienes videos pendientes ahora mismo.
          </p>
        ) : (
          pendientes.map((p) => (
            <article key={p.id} className="space-y-3 rounded-3xl border border-[#8B5CF6]/25 bg-[#8B5CF6]/[0.06] p-4">
              <div className="flex items-center justify-between">
                <span className="badge">{NOMBRE_TIPO[p.tipo]}</span>
                {p.fecha_limite ? (
                  <span className="text-xs text-white/40">Para el {new Date(p.fecha_limite).toLocaleDateString("es-ES")}</span>
                ) : null}
              </div>
              {p.referencia ? <VideoReferencia r={p.referencia} /> : null}
              {p.referencia?.descripcion ? <p className="text-sm text-white/60">&quot;{p.referencia.descripcion}&quot;</p> : null}
              {p.instrucciones ? <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white/80">{p.instrucciones}</p> : null}
              <SubirBoton tipo={p.tipo} encargoId={p.id} etiqueta="Subir mi imitacion" />
            </article>
          ))
        )}
      </Seccion>

      <Seccion titulo="Subir un video" sub="Elige el tipo de video que has grabado.">
        {TIPOS.map((t) => (
          <article key={t.tipo} className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div>
              <h3 className="font-semibold text-white">
                {t.tipo}. {t.titulo}
              </h3>
              <p className="text-sm text-white/45">{t.desc}</p>
            </div>
            <SubirBoton tipo={t.tipo} />
          </article>
        ))}
      </Seccion>

      <Seccion titulo="4. Con referencia" sub="Elige un video del banco, imitalo y sube el tuyo debajo.">
        {banco.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/40">
            Aun no hay referencias disponibles.
          </p>
        ) : (
          banco.map((r) => (
            <article key={r.id} className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <VideoReferencia r={r} />
              {r.descripcion ? <p className="text-sm text-white/60">&quot;{r.descripcion}&quot;</p> : null}
              <SubirBoton tipo={4} referenciaId={r.id} etiqueta="Subir mi imitacion" />
            </article>
          ))
        )}
      </Seccion>

      {entregas.length > 0 ? (
        <Seccion titulo="Tus ultimas entregas">
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {entregas.map((e) => {
              const st = estadoEntrega(e);
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/85">{e.titulo ?? "Video"}</p>
                    <p className="text-xs text-white/35">
                      {NOMBRE_TIPO[e.tipo ?? 1]} · {new Date(e.recibido_at).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}>{st.texto}</span>
                </li>
              );
            })}
          </ul>
        </Seccion>
      ) : null}
    </main>
  );
}
