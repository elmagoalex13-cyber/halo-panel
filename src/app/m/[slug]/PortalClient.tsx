"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SubirBoton } from "./SubirBoton";
import { OnboardingForm } from "./OnboardingForm";
import { OnlyFansPortal, type ArchivoVista } from "./OnlyFansPortal";
import type { ColeccionOF } from "@/lib/onlyfans";
import { progresoOnboarding, type DatosOnboarding } from "@/lib/onboarding";
import { GuiaOF, type ReferenciaVista } from "./GuiaOF";
import type { ProgresoCaptacion } from "@/lib/captacion";

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
  estado?: string; // "recibido" = en espera de que la agencia lo revise (captacion)
  feedback_tipo?: "bien" | "mejorar" | null;
  feedback_texto?: string | null;
};

const NOMBRE_TIPO: Record<number, string> = { 1: "Hablando", 2: "Caption / Gesto", 3: "Parar imagen", 4: "Con referencia" };
const TIPOS = [
  { tipo: 1, corto: "Hablado", desc: "Videos hablando a cámara. Nosotros ponemos los subtítulos.", icono: "🎙", etiquetaSubida: "Subir hablado" },
  { tipo: 2, corto: "Frases + música", desc: "Gestos o escenas cortas. Nosotros añadimos la frase y la música.", icono: "🎵", etiquetaSubida: "Subir gesto" },
  { tipo: 3, corto: "Parar imagen", desc: "Videos para la edición de parar imagen.", icono: "⏸", etiquetaSubida: "Subir video" },
  { tipo: 4, corto: "Referencias", desc: "Videos concretos que debes imitar.", icono: "🎯", etiquetaSubida: "Subir imitación" },
] as const;
const TEXTO_ENCARGO: Record<number, string> = {
  1: "Grábate hablando a cámara.",
  2: "Graba un gesto o escena corta.",
  3: "Graba un video para parar imagen.",
  4: "Mira la referencia y sube tu versión.",
};
const POR_PAGINA = 5;

type Pestana = "grabar" | "subir" | "guia" | "subidos" | "contenido";

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
          className="mx-auto aspect-[9/16] max-h-[72dvh] w-full object-contain"
        />
      ) : (
        <div className="grid aspect-[9/16] max-h-[40dvh] w-full place-items-center p-4 text-center text-sm text-white/40">
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

function ModalVideo({ pendiente, onClose }: { pendiente: Pendiente | null; onClose: () => void }) {
  if (!pendiente?.referencia) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-3 backdrop-blur-md sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-dvh w-full max-w-[min(94vw,440px)] flex-col justify-center gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="badge">{NOMBRE_TIPO[pendiente.tipo]}</span>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white">
            Cerrar
          </button>
        </div>
        <VideoReferencia key={pendiente.id} r={pendiente.referencia} />
        {pendiente.referencia.descripcion ? <p className="text-sm text-white/60">&quot;{pendiente.referencia.descripcion}&quot;</p> : null}
        {pendiente.instrucciones ? <p className="rounded-xl bg-white/[0.08] px-3 py-2 text-sm text-white/80">{pendiente.instrucciones}</p> : null}
      </div>
    </div>
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

function limite(fecha: string | null) {
  if (!fecha) return null;
  const d = new Date(fecha);
  const dias = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const texto = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  if (dias < 0) return { texto: `Venció el ${texto}`, clase: "text-red-300" };
  if (dias <= 1) return { texto: dias === 0 ? "Para hoy" : "Para mañana", clase: "text-amber-300" };
  return { texto: `Para el ${texto}`, clase: "text-white/40" };
}

function FilaPorGrabar({ p, onVer }: { p: Pendiente; onVer: (p: Pendiente) => void }) {
  const esReferencia = p.tipo === 4;
  const tipo = TIPOS.find((t) => t.tipo === p.tipo);
  const lim = limite(p.fecha_limite);
  const miniatura = p.referencia?.thumb;

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => (p.referencia ? onVer(p) : undefined)}
          disabled={!p.referencia}
          aria-label={p.referencia ? `Ver referencia ${NOMBRE_TIPO[p.tipo]}` : undefined}
          className="group relative h-24 w-[54px] shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/10 disabled:cursor-default"
        >
          {miniatura ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={miniatura} alt="" className="h-full w-full object-cover" />
          ) : p.referencia?.video ? (
            <video src={p.referencia.video} className="h-full w-full object-cover" muted playsInline preload="metadata" />
          ) : (
            <span className="grid h-full w-full place-items-center text-2xl">{tipo?.icono}</span>
          )}
          {p.referencia ? (
            <span className="absolute inset-0 grid place-items-center bg-black/25">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-black/65 text-white ring-1 ring-white/25">
                <svg className="ml-0.5 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6 4l6 4-6 4V4z" />
                </svg>
              </span>
            </span>
          ) : null}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge text-[10px]">{NOMBRE_TIPO[p.tipo]}</span>
            {lim ? <span className={`text-xs ${lim.clase}`}>{lim.texto}</span> : null}
          </div>
          <p className="line-clamp-3 text-sm text-white/75">{p.instrucciones || p.referencia?.descripcion || TEXTO_ENCARGO[p.tipo]}</p>
          {p.referencia ? (
            <button type="button" onClick={() => onVer(p)} className="text-xs font-semibold text-[#A78BFA]">
              {esReferencia ? "Ver referencia" : "Ver video pedido"}
            </button>
          ) : null}
        </div>
      </div>
      {esReferencia ? (
        <SubirBoton tipo={p.tipo} encargoId={p.id} referenciaId={p.referencia?.id} etiqueta="Subir mi imitación" />
      ) : p.referencia ? (
        <CompletarBoton encargoId={p.id} />
      ) : (
        <SubirBoton tipo={p.tipo} encargoId={p.id} etiqueta="Subir video" />
      )}
    </article>
  );
}

function TarjetaOnboarding({
  datos,
  estado,
  onAbrir,
}: {
  datos: DatosOnboarding;
  estado: "borrador" | "enviado";
  onAbrir: () => void;
}) {
  const progreso = progresoOnboarding(datos);
  const empezado = progreso > 0 || Object.keys(datos).some((k) => k !== "limites" && k !== "revisado");
  const enviado = estado === "enviado";
  return (
    <section
      className={`space-y-3 rounded-2xl border p-4 sm:rounded-3xl ${
        enviado ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-[#8B5CF6]/40 bg-[#8B5CF6]/[0.10]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Tu perfil de creadora</h2>
          <p className="text-sm text-white/55">
            {enviado
              ? "Recibido. Puedes revisarlo o cambiar lo que quieras cuando quieras."
              : empezado
                ? "Lo tienes a medias: se guarda solo, sigue por donde lo dejaste."
                : "Cuéntanos quién eres para preparar tu personaje. Son unos 10 minutos y se guarda solo."}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${enviado ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-400 text-black"}`}>
          {enviado ? "Enviado" : "Pendiente"}
        </span>
      </div>
      {!enviado ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#8B5CF6] transition-all" style={{ width: `${progreso}%` }} />
        </div>
      ) : null}
      <button type="button" onClick={onAbrir} className={`${enviado ? "btn-secondary" : "btn-primary"} h-11 w-full text-sm`}>
        {enviado ? "Ver o editar mis respuestas" : empezado ? "Continuar mi perfil" : "Empezar mi perfil"}
      </button>
    </section>
  );
}

export function PortalClient({
  nombre,
  slug,
  pendientes,
  entregas,
  onboarding,
  contenidoOF,
  accesos,
  captacion,
  guia,
  telegram,
}: {
  telegram: { vinculado: boolean; url: string | null };
  guia: { packs: string; posts: string; referencias: ReferenciaVista[] };
  captacion: { progreso: ProgresoCaptacion; reelsAbiertos: boolean } | null;
  accesos: { modo: "of" | "completo"; dado: boolean };
  nombre: string;
  slug: string;
  pendientes: Pendiente[];
  entregas: Entrega[];
  onboarding: { datos: DatosOnboarding; estado: "borrador" | "enviado" };
  // Contenido de OnlyFans (scripts por fases, packs, posts). null = todavia no activado (faltan las tablas).
  contenidoOF: { colecciones: ColeccionOF[]; archivos: ArchivoVista[] } | null;
}) {
  const router = useRouter();
  const [onboardingAbierto, setOnboardingAbierto] = useState(false);
  const [onboardingDatos, setOnboardingDatos] = useState(onboarding.datos);
  const [onboardingEstado, setOnboardingEstado] = useState(onboarding.estado);
  const alCambiarOnboarding = useCallback((d: DatosOnboarding, e: "borrador" | "enviado") => {
    setOnboardingDatos(d);
    setOnboardingEstado(e);
  }, []);

  const [pestana, setPestana] = useState<Pestana>("grabar");
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [videoAbierto, setVideoAbierto] = useState<Pendiente | null>(null);

  const conteos = useMemo(
    () => Object.fromEntries(TIPOS.map((t) => [t.tipo, pendientes.filter((p) => p.tipo === t.tipo).length])) as Record<number, number>,
    [pendientes],
  );
  const visibles = useMemo(() => pendientes.filter((p) => filtroTipo === null || p.tipo === filtroTipo), [pendientes, filtroTipo]);
  const lista = mostrarTodos ? visibles : visibles.slice(0, POR_PAGINA);

  async function salir() {
    await fetch("/api/portal/logout", { method: "POST" });
    router.refresh();
  }

  const pestanas: Array<{ id: Pestana; label: string; n: number | null }> = [
    { id: "grabar", label: "Por grabar", n: pendientes.length },
    { id: "subir", label: "Subir vídeos", n: null },
    { id: "guia", label: "Guía", n: null },
    { id: "subidos", label: "Subidos", n: entregas.length },
    ...(contenidoOF ? [{ id: "contenido" as Pestana, label: "Contenido", n: contenidoOF.colecciones.filter((c) => c.estado === "en_curso").length || null }] : []),
  ];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl space-y-5 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white/40">Hola</p>
          <h1 className="truncate font-display text-2xl font-semibold text-white">{nombre}</h1>
        </div>
        <button onClick={salir} className="btn-secondary min-h-11 shrink-0 px-4 text-xs">
          Salir
        </button>
      </header>

      {captacion ? (
        <section className="rounded-2xl border border-[#8B5CF6]/35 bg-[#8B5CF6]/10 p-4">
          <p className="font-display text-lg font-semibold text-white">🎯 Para empezar a trabajar contigo</p>
          <p className="mt-1 text-sm leading-relaxed text-white/60">
            {captacion.progreso.cumplido
              ? "¡Ya cumples todo lo que necesitamos! Lo estamos revisando y pronto te contamos los siguientes pasos."
              : "Necesitamos esto de ti antes de crearte la cuenta de Instagram. Mira la pestaña «Guía» para hacerlo exactamente como se indica."}
          </p>
          <div className="mt-3 space-y-3">
            {(
              [
                ["Reels", captacion.progreso.reels, null],
                ["Scripts completos y aprobados", captacion.progreso.scripts, `${captacion.progreso.scriptsEntregados} entregados`],
                ["Packs de fotos", captacion.progreso.packs, null],
                ["Posts de OnlyFans", captacion.progreso.posts, null],
              ] as const
            )
              .filter(([, m]) => m.obj !== null)
              .map(([nombre, m, extra]) => {
                const obj = m.obj as number;
                const hecho = m.n >= obj;
                return (
                  <div key={nombre}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-white">{hecho ? "✅ " : ""}{nombre}</span>
                      <span className={hecho ? "font-semibold text-emerald-300" : "text-white/70"}>
                        {Math.min(m.n, obj)}/{obj}
                        {extra && !hecho ? <span className="ml-2 text-xs text-white/40">({extra})</span> : null}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full transition-all ${hecho ? "bg-emerald-400" : "bg-[#8B5CF6]"}`} style={{ width: `${Math.min(100, Math.round((m.n / obj) * 100))}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
          {(contenidoOF?.colecciones ?? []).some((c) => c.revision === "mejorar") ? (
            <p className="mt-3 text-sm font-semibold text-amber-200">
              Tienes {(contenidoOF?.colecciones ?? []).filter((c) => c.revision === "mejorar").length} script, pack o post a mejorar: míralo en «Contenido».
            </p>
          ) : null}
          {entregas.some((e) => e.feedback_tipo === "mejorar") ? (
            <p className="mt-3 text-sm font-semibold text-amber-200">
              Tienes {entregas.filter((e) => e.feedback_tipo === "mejorar").length} reel{entregas.filter((e) => e.feedback_tipo === "mejorar").length === 1 ? "" : "s"} con comentarios del equipo: míralos en «Subidos».
            </p>
          ) : null}
        </section>
      ) : null}

      {telegram.vinculado ? (
        <p className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">🔔 Avisos de Telegram activados: te escribiremos con lo que te falte y los comentarios del equipo.</p>
      ) : telegram.url ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="min-w-0">
            <p className="font-semibold text-white">🔔 Recibe avisos en tu Telegram</p>
            <p className="text-sm text-white/50">Te diremos lo que te falta por hacer y lo que opine el equipo de tus vídeos, sin tener que entrar aquí.</p>
          </div>
          <a href={telegram.url} target="_blank" rel="noreferrer" className="btn-primary shrink-0 px-4 py-2.5 text-sm">
            Activar avisos en Telegram
          </a>
        </section>
      ) : null}

      <TarjetaOnboarding datos={onboardingDatos} estado={onboardingEstado} onAbrir={() => setOnboardingAbierto(true)} />

      {onboardingAbierto ? (
        <OnboardingForm
          slug={slug}
          datosIniciales={onboardingDatos}
          estadoInicial={onboardingEstado}
          onCerrar={() => setOnboardingAbierto(false)}
          onCambio={alCambiarOnboarding}
          accesos={accesos}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPestana("grabar")}
          className={`rounded-2xl border p-4 text-left transition ${pendientes.length ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/[0.04]"}`}
        >
          <p className="text-xs uppercase tracking-wider text-white/45">Por grabar</p>
          <p className="mt-1 font-display text-4xl font-semibold text-white">{pendientes.length}</p>
          <p className="text-xs text-white/45">{pendientes.length === 1 ? "video pendiente" : "videos pendientes"}</p>
        </button>
        <button type="button" onClick={() => setPestana("subidos")} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition">
          <p className="text-xs uppercase tracking-wider text-white/45">Subidos</p>
          <p className="mt-1 font-display text-4xl font-semibold text-white">{entregas.length}</p>
          <p className="text-xs text-white/45">{entregas.length === 1 ? "video enviado" : "videos enviados"}</p>
        </button>
      </div>

      <div role="tablist" className={`grid gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 ${pestanas.length > 3 ? "grid-cols-4" : "grid-cols-3"}`}>
        {pestanas.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={pestana === t.id}
            onClick={() => setPestana(t.id)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition ${
              pestana === t.id ? "bg-[#8B5CF6]/30 text-white" : "text-white/50"
            }`}
          >
            {t.label}
            {t.n ? (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${t.id === "grabar" && pestana !== t.id ? "bg-amber-400 text-black" : "bg-white/15 text-white"}`}>
                {t.n}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {pestana === "grabar" ? (
        <section className="space-y-3">
          {pendientes.length ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => {
                    setFiltroTipo(null);
                    setMostrarTodos(false);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${filtroTipo === null ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white" : "border-white/10 text-white/50"}`}
                >
                  Todos · {pendientes.length}
                </button>
                {TIPOS.filter((t) => conteos[t.tipo]).map((t) => (
                  <button
                    key={t.tipo}
                    type="button"
                    onClick={() => {
                      setFiltroTipo(filtroTipo === t.tipo ? null : t.tipo);
                      setMostrarTodos(false);
                    }}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${filtroTipo === t.tipo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white" : "border-white/10 text-white/50"}`}
                  >
                    {t.icono} {t.corto} · {conteos[t.tipo]}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {lista.map((p) => (
                  <FilaPorGrabar key={p.id} p={p} onVer={setVideoAbierto} />
                ))}
              </div>

              {visibles.length > POR_PAGINA ? (
                <button type="button" onClick={() => setMostrarTodos((v) => !v)} className="btn-secondary h-11 w-full text-sm">
                  {mostrarTodos ? "Ver menos" : `Ver los ${visibles.length - POR_PAGINA} restantes`}
                </button>
              ) : null}
            </>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/45">
              No tienes videos por grabar ahora mismo. ¡Todo al día! 🎉
            </p>
          )}
        </section>
      ) : null}

      {pestana === "subir" ? (
        <section className="space-y-3">
          <p className="text-sm text-white/45">Sube aquí tus videos libres. Para imitar una referencia, hazlo desde «Por grabar».</p>
          {TIPOS.filter((t) => t.tipo !== 4).map((t) => (
            <article key={t.tipo} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xl" aria-hidden="true">
                  {t.icono}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">{t.corto}</h3>
                  <p className="text-xs text-white/45">{t.desc}</p>
                </div>
                {conteos[t.tipo] ? (
                  <span className="ml-auto shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">{conteos[t.tipo]} pedidos</span>
                ) : null}
              </div>
              <SubirBoton tipo={t.tipo} etiqueta={t.etiquetaSubida} />
            </article>
          ))}
        </section>
      ) : null}

      {pestana === "subidos" ? (
        <section>
          {entregas.length ? (
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {entregas.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/85">{e.titulo ?? "Video"}</p>
                    <p className="text-xs text-white/35">
                      {NOMBRE_TIPO[e.tipo ?? 1]} · {new Date(e.recibido_at).toLocaleDateString("es-ES")}
                    </p>
                    {e.feedback_texto ? <p className="mt-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs leading-relaxed text-white/70">💬 {e.feedback_texto}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${e.estado === "recibido" ? "bg-white/10 text-white/70" : "bg-emerald-500/15 text-emerald-300"}`}>
                      {e.estado === "recibido" ? "En revisión" : "Subido"}
                    </span>
                    {e.feedback_tipo === "bien" ? <span className="text-xs font-semibold text-emerald-300">✅ Va bien</span> : null}
                    {e.feedback_tipo === "mejorar" ? <span className="text-xs font-semibold text-amber-200">⚠️ Mejorar</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/45">Todavía no has subido ningún video.</p>
          )}
        </section>
      ) : null}

      {pestana === "guia" ? <GuiaOF packs={guia.packs} posts={guia.posts} referencias={guia.referencias} /> : null}

      {pestana === "contenido" && contenidoOF ? <OnlyFansPortal colecciones={contenidoOF.colecciones} archivos={contenidoOF.archivos} /> : null}

      <ModalVideo pendiente={videoAbierto} onClose={() => setVideoAbierto(null)} />
    </main>
  );
}
