import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AtSign, CalendarDays, CheckCircle2, Clapperboard, Clock3, TrendingUp, UserCheck, Users, Wallet } from "lucide-react";
import { publerActivo } from "@/lib/publer";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { RefreshButton } from "@/components/RefreshButton";
import { StatTile } from "@/components/StatTile";
import { PeriodoSelect } from "./PeriodoSelect";
import { CreadorasFilter } from "./CreadorasFilter";
import { AvisosDashboard } from "./AvisosDashboard";
import { contarOFNuevo } from "@/lib/ofResumen";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { alcanceActual, ambitosModelos, cuentasVenuzVisibles, soloEn, soloVisibles, type GrupoAmbito } from "@/lib/alcance";
import { SelectorGrupo } from "./SelectorGrupo";
import { cargarAgregados, type ClaveAgg, type FilaAgg } from "@/lib/dashboardAgg";
import { avisosActividad } from "@/lib/actividad";
import { ahoraMadrid, estadoSemanal } from "@/lib/rondaVirales";
import { avisosSistema, leerSistema } from "@/lib/sistema";
import { avisosCaptacion, resumenCaptacion } from "@/lib/captacion";
import { modelosSinAccesos } from "@/lib/accesosModelo";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { progresoOnboarding, sanearDatos } from "@/lib/onboarding";
import type { FacturacionModelo, Modelo } from "@/types";
import { AvisarModelos } from "./AvisarModelos";
import { EnviarContrato } from "./EnviarContrato";
import { avisosContratos } from "@/lib/contratos";

export const dynamic = "force-dynamic";

type OnboardingResumen = { modelo_id: string; estado: "borrador" | "enviado"; enviado_at: string | null; updated_at: string; progreso: number };

type WithModelName<T> = T & { modelos?: { nombre?: string | null } | null };

async function loadDashboardData(grupo?: GrupoAmbito) {
  const vacio = { agg: [] as FilaAgg[], modelos: [] as Modelo[], facturacion: [] as FacturacionModelo[], onboarding: [] as OnboardingResumen[] };
  if (!canUseSupabase()) return vacio;

  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual(grupo);
    const now = new Date();
    const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const [agg, modelosResult, facturacionResult, onboardingResult] = await Promise.all([
      cargarAgregados(supabase, alcance, now),
      soloVisibles(supabase.from("modelos").select("*"), alcance, "id"),
      soloVisibles(supabase.from("facturacion_modelos").select("*, modelos(nombre)").gte("periodo_inicio", mesInicio), alcance),
      soloVisibles(supabase.from("modelo_onboarding").select("modelo_id, estado, enviado_at, updated_at, datos"), alcance),
    ]);
    const onboarding = ((onboardingResult.data ?? []) as Array<{ modelo_id: string; estado: string; enviado_at: string | null; updated_at: string; datos: unknown }>).map((row) => ({
      modelo_id: row.modelo_id,
      estado: (row.estado === "enviado" ? "enviado" : "borrador") as "borrador" | "enviado",
      enviado_at: row.enviado_at,
      updated_at: row.updated_at,
      progreso: progresoOnboarding(sanearDatos(row.datos)),
    }));
    const facturacion = ((facturacionResult.data ?? []) as Array<WithModelName<FacturacionModelo>>).map((row) => ({
      ...row,
      modelo_nombre: row.modelos?.nombre ?? "Sin modelo",
    })) as FacturacionModelo[];

    return { agg, modelos: (modelosResult.data ?? []) as Modelo[], facturacion, onboarding };
  } catch {
    return vacio;
  }
}

type VenuzMes = {
  neto: number;
  bruto: number;
  mensajes: number;
  suscripciones: number;
  otros: number;
  top: Array<{ nombre: string; neto: number }>;
  actualizado: string | null;
};

// Facturacion del mes en curso desde Venuz (la rellena el scraper del runner). null = aun sin datos.
async function loadVenuzMes(grupo?: GrupoAmbito): Promise<VenuzMes | null> {
  if (!canUseSupabase()) return null;
  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual(grupo);
    const cuentasOk = await cuentasVenuzVisibles(alcance); // el socio solo ve la facturacion de las modelos compartidas
    const hoy = new Date();
    const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const [diarios, cuentas, sync] = await Promise.all([
      soloEn(supabase.from("venuz_ingresos_diarios").select("cuenta_id, total, total_bruto, mensajes, suscripciones").gte("fecha", inicio).limit(5000), cuentasOk, "cuenta_id"),
      soloEn(supabase.from("venuz_cuentas").select("id, nombre"), cuentasOk, "id"),
      supabase.from("log_agentes").select("created_at").eq("agente", "venuz_sync").eq("accion", "sync").eq("resultado", "ok").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const filas = (diarios.data ?? []) as Array<{ cuenta_id: string; total: number | string; total_bruto: number | string; mensajes: number | string; suscripciones: number | string }>;
    if (!filas.length && !sync.data) return null;
    const nombres = new Map(((cuentas.data ?? []) as Array<{ id: string; nombre: string }>).map((c) => [c.id, c.nombre]));
    const porCuenta = new Map<string, number>();
    let neto = 0, bruto = 0, mensajes = 0, suscripciones = 0;
    for (const f of filas) {
      neto += Number(f.total); bruto += Number(f.total_bruto); mensajes += Number(f.mensajes); suscripciones += Number(f.suscripciones);
      porCuenta.set(f.cuenta_id, (porCuenta.get(f.cuenta_id) ?? 0) + Number(f.total));
    }
    const top = [...porCuenta.entries()].sort(([, a], [, b]) => b - a).slice(0, 3).map(([id, n]) => ({ nombre: nombres.get(id) ?? "—", neto: n }));
    return { neto, bruto, mensajes, suscripciones, otros: Math.max(0, neto - mensajes - suscripciones), top, actualizado: sync.data?.created_at ?? null };
  } catch {
    return null;
  }
}

const usd = (v: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(v);

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; creadoras?: string; grupo?: string }>;
}) {
  const { periodo: periodoParam, creadoras: creadorasParam, grupo: grupoParam } = await searchParams;
  const grupo: GrupoAmbito | undefined = grupoParam === "mias" || grupoParam === "compartidas" ? grupoParam : undefined;
  const periodo = periodoParam === "mes" || periodoParam === "semana" ? periodoParam : "todo";
  const creadorasPeriodo = creadorasParam === "30d" ? "30d" : "todo";

  const [{ agg, modelos, facturacion, onboarding }, cuentasReales, venuz, ofNuevo, sesionPanel, ambitosTodas, avisosSocio, sistema, captacion, sinAccesos, semanal, avisosContrato] = await Promise.all([loadDashboardData(grupo), loadCuentasInstagramReales(grupo), loadVenuzMes(grupo), contarOFNuevo(grupo), sesionPanelActual(), ambitosModelos(), avisosActividad(), leerSistema(), resumenCaptacion(await alcanceActual(grupo)), modelosSinAccesos(await alcanceActual(grupo)), estadoSemanal().catch(() => null), avisosContratos()]);
  const ambitos: Record<string, string> = sesionPanel?.dueno ? ambitosTodas.porModelo : {};
  const nCompartidas = Object.values(ambitos).filter((a) => a === "compartido").length;
  const veFacturacion = !sesionPanel?.denegadas.includes("facturacion");
  const veOnlyFans = !sesionPanel?.denegadas.includes("onlyfans");
  const cuentasIG = loadCuentasIG(cuentasReales);

  // Suma de un agregado en todas las modelos visibles; por modelo se consulta en `aggPorModelo`
  const S = (k: ClaveAgg) => agg.reduce((acc, r) => acc + (r[k] ?? 0), 0);
  const aggPorModelo = new Map(agg.map((r) => [r.modelo_id, r]));

  const now = new Date();

  const enAprobacion = S("en_aprobacion");
  const reelsEsteMes = S("este_mes");
  const reelsMesPasado = S("mes_pasado");
  const deltaReelsPct = reelsMesPasado ? Math.round(((reelsEsteMes - reelsMesPasado) / reelsMesPasado) * 100) : undefined;

  const modelosActivas = modelos.filter((m) => m.activa).length;
  const aprobadosSemana = S("aprob_semana");
  const publicados = S("publicado");
  const programadas = S("aprobado_futuro");
  const sinProgramar = S("aprobado") - S("aprobado_futuro");
  const etapas = [
    { label: "Editando", href: "/aprobacion?estado=editando", desc: "el editor IA los procesa", total: S("editando") },
    { label: "En aprobación", href: "/aprobacion", desc: "esperan tu decisión", total: S("en_aprobacion") },
    { label: "Sin programar", href: "/aprobacion?estado=aprobado", desc: "aprobados, para descargar", total: sinProgramar },
    { label: "Programados", href: "/aprobacion?estado=aprobado", desc: "en Publer", total: programadas },
    { label: "Publicados", href: "/aprobacion?estado=aprobado", desc: "ya en Instagram", total: S("publicado") },
  ].map((e) => ({ ...e, estado: e.label }));
  const trialsSinProgramar = S("trial_aprob_sin");
  const trialsProgramados = S("trial_aprob_futuro");
  const trialsPublicados = S("trial_publicados");
  const maxEtapa = Math.max(1, ...etapas.map((e) => e.total));
  const rechazados = S("rechazado");
  const runnerPendiente = S("r_pend");
  const runnerProcesando = S("r_proc");
  const runnerError = S("r_err");

  // Dias de contenido: reels aprobados que aun no han salido, entre lo que consumen las cuentas
  // de IG de la modelo (2 reels al dia por cuenta; los trial reels son aparte).
  const REELS_POR_CUENTA_DIA = 2;
  const UMBRAL_DIAS = 3;
  const contenidoModelos = modelos
    .map((modelo) => {
      const cuentasIG = cuentasReales.filter((c) => c.modelo_id === modelo.id && c.activa !== false).length;
      const a = aggPorModelo.get(modelo.id);
      const stock = a ? a.aprobado - a.aprobado_pasado : 0; // aprobados que aun no han salido
      const enCamino = a ? a.en_aprobacion + a.editando : 0;
      const consumoDia = cuentasIG * REELS_POR_CUENTA_DIA;
      return { modelo, cuentasIG, stock, enCamino, consumoDia, dias: consumoDia ? stock / consumoDia : null };
    })
    .filter((c): c is typeof c & { dias: number } => c.dias !== null)
    .sort((a, b) => a.dias - b.dias);
  const diasContenidoMin = contenidoModelos.length ? contenidoModelos[0].dias : null;
  const contenidoBajo = contenidoModelos.filter((c) => c.dias <= UMBRAL_DIAS);
  const fmtDias = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

  const aprobados = S(periodo === "semana" ? "ap_semana" : periodo === "mes" ? "ap_mes" : "ap_todo");
  const completados = S(periodo === "semana" ? "co_semana" : periodo === "mes" ? "co_mes" : "co_todo");
  const periodoLabel = periodo === "mes" ? "Este mes" : periodo === "semana" ? "Esta semana" : "Todo el tiempo";

  // Saludo dinamico
  const hour = now.getHours();
  const saludo = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";

  // Notificaciones
  const d7ago = Date.now() - 7 * 24 * 3600000;
  const aprobacionUrgente = { length: S("urg_aprob") }; // en aprobacion desde hace mas de 24 h
  const rehacerPendientes = { length: S("urg_edit") }; // en edicion desde hace mas de 24 h
  const modelosSinMaterial = modelos.filter((m) => {
    const ult = aggPorModelo.get(m.id)?.ult_recibido;
    return !ult || new Date(ult).getTime() < d7ago;
  });
  const onboardingPorModelo = new Map(onboarding.map((o) => [o.modelo_id, o]));
  const onboardingNuevos = modelos.filter((m) => {
    const o = onboardingPorModelo.get(m.id);
    return o?.estado === "enviado" && o.enviado_at && new Date(o.enviado_at).getTime() >= d7ago;
  });
  const onboardingPendientes = modelos.filter((m) => m.activa && onboardingPorModelo.get(m.id)?.estado !== "enviado");
  type NotifNivel = "rojo" | "amarillo" | "verde";
  const notificaciones: { id?: string; nivel: NotifNivel; texto: string; href?: string }[] = [
    // Lo sensible que ha hecho tu socio (solo lo ve el dueño)
    ...(sesionPanel?.dueno ? avisosSocio : []),
    // Contratos para modelos nuevas: firmados esta semana / pendientes de firma
    ...avisosContrato,
    // Ronda semanal de cuentas de referencia (la lanza sola la extension de Chrome cada lunes)
    ...(semanal?.hecha
      ? [{ id: `ronda-hecha|${semanal.semana}`, nivel: "verde" as NotifNivel, texto: `Ronda semanal hecha: ${semanal.cuentas ?? "todas las"} cuentas analizadas, ${semanal.nuevos ?? 0} virales nuevos. Ya puedes revisarlos y asignarlos`, href: "/instagram?tab=ideas" }]
      : semanal && (ahoraMadrid().dia > 1 || ahoraMadrid().hora >= 12)
        ? [{ id: `ronda-pendiente|${semanal.semana}`, nivel: "amarillo" as NotifNivel, texto: `La ronda semanal de cuentas no se ha completado${semanal.ronda ? ` (${semanal.ronda.hechas}/${semanal.ronda.total})` : " (no ha empezado)"}: se hace sola cuando hay un Chrome abierto con la extensión «HALO Virales», con Instagram y el panel con la sesión iniciada`, href: "/instagram?tab=ideas" }]
        : []),
    // Editor de video caido o cola atascada
    ...avisosSistema(sistema),
    // Captacion: crear la cuenta de Instagram / aprobar el lote de una modelo
    ...avisosCaptacion(captacion),
    // Accesos de OnlyFans y Skrill que faltan por dar (obligatorios en el portal)
    ...(sinAccesos.some((m) => m.compartida)
      ? [{ id: `acc|compartidas|${sinAccesos.filter((m) => m.compartida).map((m) => m.nombre).sort().join(",")}`, nivel: "amarillo" as NotifNivel, texto: `Faltan los accesos de OnlyFans y Skrill (se piden en el formulario de su perfil) de: ${sinAccesos.filter((m) => m.compartida).map((m) => m.nombre).join(", ")}`, href: "/modelos" }]
      : []),
    ...(sinAccesos.some((m) => !m.compartida)
      ? [{ id: `acc|privadas|${sinAccesos.filter((m) => !m.compartida).map((m) => m.nombre).sort().join(",")}`, nivel: "amarillo" as NotifNivel, texto: `Falta el acceso de OnlyFans (en el formulario de su perfil) de: ${sinAccesos.filter((m) => !m.compartida).map((m) => m.nombre).join(", ")}`, href: "/modelos" }]
      : []),
    ...(contenidoBajo.length > 0
      ? [
          {
            id: `bajo|${contenidoBajo.map((c) => c.modelo.nombre).sort().join(",")}`,
            nivel: "rojo" as NotifNivel,
            texto: `Contenido para solo ${fmtDias(contenidoBajo[0].dias)} día${contenidoBajo[0].dias === 1 ? "" : "s"}: ${contenidoBajo
              .map((c) => `${c.modelo.nombre} (${fmtDias(c.dias)} d · ${c.stock} reels para ${c.cuentasIG} cuenta${c.cuentasIG === 1 ? "" : "s"})`)
              .join(", ")}`,
            href: "/asignar",
          },
        ]
      : []),
    ...(aprobacionUrgente.length > 0
      ? [{ id: "aprobacion-urgente", nivel: "rojo" as NotifNivel, texto: `${aprobacionUrgente.length} vídeo${aprobacionUrgente.length > 1 ? "s" : ""} llevan más de 24h esperando aprobación`, href: "/aprobacion" }]
      : []),
    ...(rehacerPendientes.length > 0
      ? [{ id: "rehacer-pendientes", nivel: "amarillo" as NotifNivel, texto: `${rehacerPendientes.length} vídeo${rehacerPendientes.length > 1 ? "s" : ""} en edición pendientes de procesar`, href: "/aprobacion" }]
      : []),
    ...(modelosSinMaterial.length > 0
      ? [{ id: `sin-material|${modelosSinMaterial.map((m) => m.nombre).sort().join(",")}`, nivel: "amarillo" as NotifNivel, texto: `Sin material nuevo en 7+ días: ${modelosSinMaterial.map((m) => m.nombre).join(", ")}` }]
      : []),
    ...(sinProgramar > 0
      ? [{ id: "sin-programar", nivel: "amarillo" as NotifNivel, texto: publerActivo() ? `${sinProgramar} vídeo${sinProgramar > 1 ? "s" : ""} aprobado${sinProgramar > 1 ? "s" : ""} pendiente${sinProgramar > 1 ? "s" : ""} de programar en Publer` : `${sinProgramar} vídeo${sinProgramar > 1 ? "s" : ""} aprobado${sinProgramar > 1 ? "s" : ""} sin programar: Publer no está activo, descárgalo${sinProgramar > 1 ? "s" : ""} y súbelo${sinProgramar > 1 ? "s" : ""} tú`, href: "/aprobacion?estado=aprobado" }]
      : []),
    ...(runnerError > 0
      ? [{ id: "runner-error", nivel: "rojo" as NotifNivel, texto: `${runnerError} vídeo${runnerError > 1 ? "s" : ""} con error en el runner de edición`, href: "/aprobacion" }]
      : []),
    ...(onboardingNuevos.length > 0
      ? [{ id: `onb-recibido|${onboardingNuevos.map((m) => m.nombre).sort().join(",")}`, nivel: "verde" as NotifNivel, texto: `Onboarding recibido: ${onboardingNuevos.map((m) => m.nombre).join(", ")}`, href: `/modelos/${onboardingNuevos[0].id}#onboarding` }]
      : []),
    ...(onboardingPendientes.length > 0
      ? [{ id: `onb-pendiente|${onboardingPendientes.map((m) => m.nombre).sort().join(",")}`, nivel: "amarillo" as NotifNivel, texto: `Onboarding sin enviar: ${onboardingPendientes.map((m) => m.nombre).join(", ")}` }]
      : []),
    ...(enAprobacion > 0 && aprobacionUrgente.length === 0
      ? [{ id: "listos-revisar", nivel: "verde" as NotifNivel, texto: `${enAprobacion} vídeo${enAprobacion > 1 ? "s" : ""} listo${enAprobacion > 1 ? "s" : ""} para revisar`, href: "/aprobacion" }]
      : []),
    ...(veOnlyFans && ofNuevo.count > 0
      ? [{ id: `of-nuevo|${[...ofNuevo.modelos].sort().join(",")}`, nivel: "verde" as NotifNivel, texto: `Contenido de OnlyFans nuevo${ofNuevo.modelos.length ? ` de ${ofNuevo.modelos.join(", ")}` : ""} (${ofNuevo.count} ${ofNuevo.count === 1 ? "entrega" : "entregas"})`, href: "/onlyfans" }]
      : []),
  ];

  const totalBruto = facturacion.reduce((sum, row) => sum + Number(row.ingresos_brutos), 0);
  const totalComision = facturacion.reduce((sum, row) => sum + Number(row.comision_agencia), 0);
  const totalNeto = facturacion.reduce((sum, row) => sum + Number(row.neto_modelo), 0);

  const resumenCreadoras = modelos.map((modelo) => {
    const a = aggPorModelo.get(modelo.id);
    const treinta = creadorasPeriodo === "30d";
    const producidos = a ? (treinta ? a.p30_total : a.total) : 0;
    const aprobadosModelo = a ? (treinta ? a.p30_aprobados : a.aprobado + a.publicado) : 0;
    const publicadosModelo = a ? (treinta ? a.p30_publicados : a.publicado) : 0;
    const tasa = producidos ? Math.round((aprobadosModelo / producidos) * 100) : 0;
    return { modelo, producidos, aprobados: aprobadosModelo, publicados: publicadosModelo, tasa };
  });

  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">{saludo} 👋</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Panel de Administracion</h1>
      </div>

      {sesionPanel?.dueno ? (
        <SelectorGrupo actual={grupo ?? "todas"} totales={{ todas: Object.keys(ambitos).length, mias: Object.keys(ambitos).length - nCompartidas, compartidas: nCompartidas }} periodo={periodoParam} creadoras={creadorasParam} />
      ) : null}

      <AvisosDashboard avisos={notificaciones} />

      <AvisarModelos />

      <EnviarContrato />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Modelos activas" value={modelosActivas} icon={Users} subtitle={`de ${modelos.length} registradas`} />
        <StatTile
          label="Días de contenido"
          value={diasContenidoMin === null ? "—" : fmtDias(diasContenidoMin)}
          icon={CalendarDays}
          glow={diasContenidoMin !== null && diasContenidoMin <= UMBRAL_DIAS ? "purple" : undefined}
          subtitle={
            diasContenidoMin === null
              ? "sin cuentas de IG activas"
              : `${contenidoModelos[0].modelo.nombre}, la que menos tiene · ${REELS_POR_CUENTA_DIA} reels/día por cuenta`
          }
        />
        <StatTile label="Vídeos en sistema" value={S("total")} icon={Clapperboard} subtitle="en total" />
        <StatTile
          label="Por revisar"
          value={enAprobacion}
          icon={Clock3}
          glow={enAprobacion > 0 ? "purple" : undefined}
          subtitle="en mesa de aprobación"
        />
        <StatTile label="Aprobados esta semana" value={aprobadosSemana} icon={UserCheck} subtitle="últimos 7 días" />
        <StatTile label="Publicados" value={publicados} icon={CheckCircle2} subtitle="en total" />
      </div>

      <GlassCard className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Días de contenido por modelo</h2>
            <p className="text-xs text-white/40">
              Reels aprobados que aún no han salido ÷ ({REELS_POR_CUENTA_DIA} reels al día × cuentas de IG activas). Aviso rojo con {UMBRAL_DIAS} días o menos.
            </p>
          </div>
          <Link href="/asignar" className="text-xs font-semibold text-[#A78BFA] hover:underline">
            Asignar vídeos →
          </Link>
        </div>
        {contenidoModelos.length ? (
          <ul className="mt-4 space-y-3">
            {contenidoModelos.map((c) => {
              const nivel = c.dias <= UMBRAL_DIAS ? "rojo" : c.dias <= 7 ? "amarillo" : "verde";
              const color = { rojo: "text-red-300", amarillo: "text-amber-300", verde: "text-emerald-300" }[nivel];
              const barra = { rojo: "bg-red-400", amarillo: "bg-amber-400", verde: "bg-emerald-400" }[nivel];
              return (
                <li key={c.modelo.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link href={`/modelos/${c.modelo.id}`} className="font-medium text-white hover:text-[#A78BFA]">
                      {c.modelo.nombre}
                    </Link>
                    <span className="text-xs text-white/40">
                      {c.stock} reel{c.stock === 1 ? "" : "s"} aprobado{c.stock === 1 ? "" : "s"} · {c.cuentasIG} cuenta{c.cuentasIG === 1 ? "" : "s"} · sale {c.consumoDia}/día
                      {c.enCamino ? ` · +${c.enCamino} en camino` : ""}
                    </span>
                    <span className={`font-display text-lg font-semibold ${color}`}>{fmtDias(c.dias)} días</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className={`h-full rounded-full ${barra}`} style={{ width: `${Math.min(100, (c.dias / 14) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-white/40">Ninguna modelo tiene cuentas de Instagram activas todavía.</p>
        )}
      </GlassCard>

      <GlassCard className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Pipeline en directo</h2>
            <p className="text-xs text-white/40">Se actualiza solo cada 30 segundos</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="badge">{runnerPendiente} en cola</span>
            <span className="badge">{runnerProcesando} procesando</span>
            <span className={`badge ${runnerError > 0 ? "badge-rechazado" : ""}`}>{runnerError} con error</span>
            <span className="badge">{rechazados} rechazados</span>
          </div>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {etapas.map((e, i) => (
            <li key={e.estado}>
              <Link
                href={e.href}
                className="group flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 transition hover:border-[#8B5CF6]/40 hover:bg-white/[0.06]"
              >
                <span className="text-[10px] uppercase tracking-wider text-white/30">
                  {i + 1}. {e.label}
                </span>
                <span className="mt-2 font-display text-3xl font-semibold text-white">{e.total}</span>
                <span className="text-[11px] text-white/40">{e.desc}</span>
                <span className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA]"
                    style={{ width: `${(e.total / maxEtapa) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-white/50">
          <span className="font-semibold text-white/70">Trial reels (automáticos):</span>
          <span className="badge">{trialsSinProgramar} en cola</span>
          <span className="badge">{trialsProgramados} programados</span>
          <span className="badge">{trialsPublicados} publicados</span>
        </div>
      </GlassCard>

      <GlassCard className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Onboarding de creadoras</h2>
            <p className="text-xs text-white/40">Lo que rellenan en su portal. Se guarda para siempre, con historial de versiones.</p>
          </div>
          <span className="badge">
            {modelos.filter((m) => onboardingPorModelo.get(m.id)?.estado === "enviado").length} de {modelos.length} enviados
          </span>
        </div>
        <ul className="mt-4 divide-y divide-white/[0.06]">
          {modelos.map((m) => {
            const o = onboardingPorModelo.get(m.id);
            return (
              <li key={m.id}>
                <Link href={`/modelos/${m.id}#onboarding`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm transition hover:text-[#A78BFA]">
                  <span className="min-w-0 flex-1 truncate font-medium text-white">{m.nombre}</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      o?.estado === "enviado"
                        ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                        : o
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                          : "border-white/10 bg-white/[0.04] text-white/40"
                    }`}
                  >
                    {o?.estado === "enviado" ? "Enviado" : o ? `A medias · ${o.progreso}%` : "Sin empezar"}
                  </span>
                  <span className="w-28 text-right text-xs text-white/35">
                    {o ? new Date(o.updated_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "Europe/Madrid" }) : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <GlassCard className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">Rendimiento</h2>
          <PeriodoSelect />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <PerformanceStat
            label="Reels este mes"
            value={reelsEsteMes}
            icon={TrendingUp}
            accent="teal"
            note={reelsMesPasado ? `vs mes anterior (${reelsMesPasado})` : "sin datos del mes anterior"}
            trendPct={deltaReelsPct}
          />
          <PerformanceStat label="Aprobados" value={aprobados} icon={CheckCircle2} note={periodoLabel} />
          <PerformanceStat label="Completados" value={completados} icon={CheckCircle2} accent="teal" note={periodoLabel} />
        </div>
      </GlassCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <CollapsibleSection
          title="Resumen de Creadoras"
          icon={<Users className="h-5 w-5 text-[color:var(--accent-2)]" />}
          headerRight={<CreadorasFilter />}
          defaultOpen
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-white/30">
                  <th className="pb-2">Modelo</th>
                  <th className="pb-2 text-right">Producidos</th>
                  <th className="pb-2 text-right">Aprobados</th>
                  <th className="pb-2 text-right">Publicados</th>
                  <th className="pb-2 text-right">Tasa aprobacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {resumenCreadoras.map(({ modelo, producidos, aprobados: aprobadosModelo, publicados, tasa }) => (
                  <tr key={modelo.id}>
                    <td className="py-2.5 font-medium text-white">{modelo.nombre}</td>
                    <td className="py-2.5 text-right text-white/70">{producidos}</td>
                    <td className="py-2.5 text-right text-white/70">{aprobadosModelo}</td>
                    <td className="py-2.5 text-right text-white/70">{publicados}</td>
                    <td className="py-2.5 text-right text-white/70">{tasa}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        {veFacturacion ? (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Wallet className="h-5 w-5 text-[color:var(--accent-2)]" /> Facturacion del mes
            </h2>
            <Link href="/facturacion" className="text-xs font-semibold text-[#A78BFA] hover:underline">
              Ver detalle →
            </Link>
          </div>
          {venuz ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-[#8B5CF6]/25 bg-gradient-to-br from-[#8B5CF6]/15 via-[#8B5CF6]/[0.04] to-transparent p-4">
                <p className="text-xs text-white/50">Neto este mes (Venuz)</p>
                <p className="mt-1 font-display text-3xl font-semibold text-white">{usd(venuz.neto)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniBilling label="Bruto" value={usd(venuz.bruto)} />
                <MiniBilling label="Mensajes" value={venuz.neto > 0 ? `${Math.round((venuz.mensajes / venuz.neto) * 100)}%` : "—"} />
              </div>
              {venuz.top.length ? (
                <ul className="space-y-1.5 text-sm">
                  {venuz.top.map((t) => (
                    <li key={t.nombre} className="flex justify-between text-white/70">
                      <span>{t.nombre}</span>
                      <span className="text-white">{usd(t.neto)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {venuz.actualizado ? (
                <p className="text-[11px] text-white/35">Actualizado {new Date(venuz.actualizado).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-[#8B5CF6]/25 bg-gradient-to-br from-[#8B5CF6]/15 via-[#8B5CF6]/[0.04] to-transparent p-4">
                <p className="text-xs text-white/50">Neto modelos</p>
                <p className="mt-1 font-display text-3xl font-semibold text-white">{formatCurrency(totalNeto)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniBilling label="Ingresos brutos" value={formatCurrency(totalBruto)} />
                <MiniBilling label="Comision agencia" value={formatCurrency(totalComision)} />
              </div>
            </div>
          )}
        </GlassCard>
        ) : null}
      </div>

      <GlassCard className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-5">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-white">
            <AtSign className="h-5 w-5 text-[color:var(--accent-2)]" /> Instagram — Resumen de Cuentas
          </h2>
          <RefreshButton />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-white/30">
                <th className="px-5 py-3">Creadora</th>
                <th className="px-5 py-3">Cuenta</th>
                <th className="px-5 py-3 text-right">Seguidores</th>
                <th className="px-5 py-3 text-right">Δ Dia</th>
                <th className="px-5 py-3 text-right">Vistas 30d</th>
                <th className="px-5 py-3 text-right">Score</th>
                <th className="px-5 py-3 text-right">Posts</th>
                <th className="px-5 py-3 text-right">Reels</th>
                <th className="px-5 py-3 text-right">Ultima actualizacion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {cuentasIG.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-white/35">
                    Sin cuentas de Instagram. Anadelas en Modelos.
                  </td>
                </tr>
              ) : null}
              {cuentasIG.map((cuenta) => {
                const conectada = cuenta.metricool_estado === "conectada";
                const dato = (valor: number) => (conectada ? formatNumber(valor) : "—");
                const vistas30d = cuenta.reels.reduce((sum, reel) => sum + reel.visitas, 0);
                const score = Math.round(vistas30d / Math.max(1, cuenta.publicaciones));
                return (
                  <tr key={cuenta.id}>
                    <td className="px-5 py-3 text-white/85">{cuenta.modelo_nombre}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="font-code text-white/85">@{cuenta.username}</span>{" "}
                      <span className={`badge whitespace-nowrap text-[9px] ${conectada ? "badge-aprobado" : ""}`}>
                        {conectada ? "Metricool" : "Solo scraping"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-white/85">{cuenta.seguidores > 0 ? formatNumber(cuenta.seguidores) : "—"}</td>
                    <td className="px-5 py-3 text-right font-semibold text-white/40">
                      {conectada ? `${cuenta.ganancia_hoy >= 0 ? "+" : ""}${formatNumber(cuenta.ganancia_hoy)}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-white/85">{dato(vistas30d)}</td>
                    <td className="px-5 py-3 text-right text-white/85">{dato(score)}</td>
                    <td className="px-5 py-3 text-right text-white/85">{dato(cuenta.publicaciones)}</td>
                    <td className="px-5 py-3 text-right text-white/85">{dato(cuenta.reels_30d_count)}</td>
                    <td className="px-5 py-3 text-right text-white/40">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </PanelLayout>
  );
}

function MiniBilling({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="text-[11px] text-white/40">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function PerformanceStat({
  label,
  value,
  icon: Icon,
  note,
  trendPct,
  accent,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  note?: string;
  trendPct?: number;
  accent?: "teal";
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[color:var(--text-secondary)]">{label}</p>
        <Icon className="h-4 w-4 text-[color:var(--accent-2)]" />
      </div>
      <p className={`mt-3 font-display text-3xl font-semibold ${accent === "teal" ? "kpi-glow-teal" : "text-white"}`}>{value}</p>
      {note || trendPct !== undefined ? (
        <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">
          {trendPct !== undefined ? (
            <span className={trendPct >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
              {trendPct >= 0 ? "▲" : "▼"} {Math.abs(trendPct)}%{" "}
            </span>
          ) : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}
