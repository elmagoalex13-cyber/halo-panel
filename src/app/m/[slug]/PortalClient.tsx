"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SubirBoton } from "./SubirBoton";

export type Referencia = {
  id: string;
  video: string | null;
  thumb: string | null;
  instagram: string | null;
  descripcion: string | null;
};
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
  recibido_at: string;
};

const NOMBRE_TIPO: Record<number, string> = { 1: "Hablando", 2: "Caption / Gesto", 3: "Parar imagen", 4: "Con referencia" };
const TABS = [
  { tipo: 1, titulo: "Hablado", desc: "Videos hablando a camara con subtitulos.", etiquetaSubida: "Subir hablado" },
  { tipo: 2, titulo: "Frases + musica", desc: "Gestos o escenas cortas para frase y musica.", etiquetaSubida: "Subir gesto" },
  { tipo: 3, titulo: "Parar imagen", desc: "Videos para editar con congelado.", etiquetaSubida: "Subir video" },
  { tipo: 4, titulo: "Referencias", desc: "Videos concretos que debes imitar.", etiquetaSubida: "Subir imitacion" },
] as const;
const TEXTO_ENCARGO: Record<number, string> = {
  1: "Grabate hablando a camara. Le pondremos los subtitulos.",
  2: "Graba un gesto o escena corta. Nosotros anadimos la frase y la musica.",
  3: "Graba un video para que podamos hacer la edicion de parar imagen.",
  4: "Mira la referencia y sube tu version.",
};

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

function CompletarBoton({ encargoId }: { encargoId: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/encargo-completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encargo_id: encargoId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "No se pudo completar");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={completar} disabled={cargando} className="btn-secondary h-11 w-full text-sm disabled:opacity-60">
        {cargando ? "Marcando..." : "Marcar completado"}
      </button>
      {error ? <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

function TarjetaPendiente({ p }: { p: Pendiente }) {
  const esReferencia = p.tipo === 4;
  const tieneVideoPedido = Boolean(p.referencia);

  return (
    <article className="space-y-3 rounded-3xl border border-[#8B5CF6]/25 bg-[#8B5CF6]/[0.06] p-4">
      <div className="flex items-center justify-between">
        <span className="badge">{NOMBRE_TIPO[p.tipo]}</span>
        {p.fecha_limite ? <span className="text-xs text-white/40">Para el {new Date(p.fecha_limite).toLocaleDateString("es-ES")}</span> : null}
      </div>
      <p className="text-sm text-white/55">{TEXTO_ENCARGO[p.tipo] ?? "Sube el video pedido."}</p>
      {p.referencia ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{esReferencia ? "Referencia que debes imitar" : "Video pedido"}</p>
          <VideoReferencia r={p.referencia} />
        </div>
      ) : null}
      {p.referencia?.descripcion ? <p className="text-sm text-white/60">&quot;{p.referencia.descripcion}&quot;</p> : null}
      {p.instrucciones ? <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white/80">{p.instrucciones}</p> : null}
      {esReferencia ? (
        <SubirBoton tipo={p.tipo} encargoId={p.id} referenciaId={p.referencia?.id} etiqueta="Subir mi imitacion" />
      ) : tieneVideoPedido ? (
        <CompletarBoton encargoId={p.id} />
      ) : (
        <SubirBoton tipo={p.tipo} encargoId={p.id} referenciaId={p.referencia?.id} etiqueta="Subir video" />
      )}
    </article>
  );
}

function SubidaLibre({ tipo }: { tipo: number }) {
  const tab = TABS.find((t) => t.tipo === tipo);
  if (!tab || tipo === 4) return null;
  return (
    <article className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div>
        <h3 className="font-semibold text-white">Subir {tab.titulo.toLowerCase()}</h3>
        <p className="text-sm text-white/45">{tab.desc}</p>
      </div>
      <SubirBoton tipo={tipo} etiqueta={tab.etiquetaSubida} />
    </article>
  );
}

export function PortalClient({
  nombre,
  pendientes,
  entregas,
}: {
  nombre: string;
  slug: string;
  pendientes: Pendiente[];
  entregas: Entrega[];
}) {
  const router = useRouter();
  const [tabActiva, setTabActiva] = useState(1);
  const conteos = useMemo(() => Object.fromEntries(TABS.map((tab) => [tab.tipo, pendientes.filter((p) => p.tipo === tab.tipo).length])), [pendientes]);
  const pendientesActivos = useMemo(() => pendientes.filter((p) => p.tipo === tabActiva), [pendientes, tabActiva]);
  const tab = TABS.find((t) => t.tipo === tabActiva) ?? TABS[0];

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

      <Seccion titulo="Tus videos" sub="Entra en cada apartado para ver lo pendiente y subir el contenido correcto.">
        <div className="grid grid-cols-2 gap-2">
          {TABS.map((item) => {
            const activo = item.tipo === tabActiva;
            const count = conteos[item.tipo] ?? 0;
            return (
              <button
                key={item.tipo}
                type="button"
                onClick={() => setTabActiva(item.tipo)}
                className={`flex min-h-16 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-left transition ${
                  activo ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/55"
                }`}
              >
                <span className="min-w-0 text-sm font-semibold leading-tight">{item.titulo}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${count ? "bg-amber-400 text-black" : "bg-white/10 text-white/45"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">{tab.titulo}</h2>
              <p className="text-sm text-white/45">{tab.desc}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#8B5CF6]/20 px-2.5 py-1 text-xs font-semibold text-[#ddd6fe]">
              {conteos[tab.tipo] ?? 0} pendientes
            </span>
          </div>

          {pendientesActivos.length ? (
            <div className="space-y-3">
              {pendientesActivos.map((p) => (
                <TarjetaPendiente key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/40">
              No tienes videos pendientes en este apartado.
            </p>
          )}

          {tab.tipo === 4 ? null : <SubidaLibre tipo={tab.tipo} />}
        </div>
      </Seccion>

      {entregas.length > 0 ? (
        <Seccion titulo="Tus videos subidos">
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {entregas.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white/85">{e.titulo ?? "Video"}</p>
                  <p className="text-xs text-white/35">
                    {NOMBRE_TIPO[e.tipo ?? 1]} · {new Date(e.recibido_at).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">Subido</span>
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}
    </main>
  );
}
