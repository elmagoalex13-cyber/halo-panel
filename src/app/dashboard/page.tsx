import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AtSign, CheckCircle2, Clapperboard, Clock3, TrendingUp, UserCheck, Users, Wallet } from "lucide-react";
import { publerActivo } from "@/lib/publer";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { RefreshButton } from "@/components/RefreshButton";
import { StatTile } from "@/components/StatTile";
import { PeriodoSelect } from "./PeriodoSelect";
import { CreadorasFilter } from "./CreadorasFilter";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { FacturacionModelo, LibraryContent, Modelo } from "@/types";

export const dynamic = "force-dynamic";

type WithModelName<T> = T & { modelos?: { nombre?: string | null } | null };

async function loadDashboardData() {
  const vacio = { videos: [] as LibraryContent[], modelos: [] as Modelo[], facturacion: [] as FacturacionModelo[], trials: [] as Array<{ estado: string; publicado_at: string | null }> };
  let trials: Array<{ estado: string; publicado_at: string | null }> = [];
  if (!canUseSupabase()) return vacio;

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const [videosResult, modelosResult, facturacionResult] = await Promise.all([
      supabase.from("library_content").select("*, modelos(nombre)").order("recibido_at", { ascending: false }).limit(5000),
      supabase.from("modelos").select("*"),
      supabase.from("facturacion_modelos").select("*, modelos(nombre)").gte("periodo_inicio", mesInicio),
    ]);

    const todas = (videosResult.data ?? []) as Array<WithModelName<LibraryContent> & { tipo?: number | null }>;
    trials = todas.filter((v) => v.tipo === 5).map((v) => ({ estado: v.estado, publicado_at: (v as { publicado_at?: string | null }).publicado_at ?? null }));
    const videos = todas.filter((v) => v.tipo !== 5).map((video) => ({
      ...video,
      modelo_nombre: video.modelos?.nombre ?? "Sin modelo",
    })) as LibraryContent[];
    const facturacion = ((facturacionResult.data ?? []) as Array<WithModelName<FacturacionModelo>>).map((row) => ({
      ...row,
      modelo_nombre: row.modelos?.nombre ?? "Sin modelo",
    })) as FacturacionModelo[];

    return { videos, modelos: (modelosResult.data ?? []) as Modelo[], facturacion, trials };
  } catch {
    return vacio;
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; creadoras?: string }>;
}) {
  const { periodo: periodoParam, creadoras: creadorasParam } = await searchParams;
  const periodo = periodoParam === "mes" || periodoParam === "semana" ? periodoParam : "todo";
  const creadorasPeriodo = creadorasParam === "30d" ? "30d" : "todo";

  const [{ videos, modelos, facturacion, trials }, cuentasReales] = await Promise.all([loadDashboardData(), loadCuentasInstagramReales()]);
  const cuentasIG = loadCuentasIG(cuentasReales);

  const now = new Date();
  const weekAgo = Date.now() - 7 * 24 * 3600000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  function withinPeriodo(dateStr: string) {
    const d = new Date(dateStr);
    if (periodo === "semana") return d.getTime() >= weekAgo;
    if (periodo === "mes") return d >= monthStart;
    return true;
  }

  const enAprobacion = videos.filter((video) => video.estado === "en_aprobacion").length;
  const reelsEsteMes = videos.filter((video) => new Date(video.recibido_at) >= monthStart).length;
  const reelsMesPasado = videos.filter((video) => {
    const d = new Date(video.recibido_at);
    return d >= lastMonthStart && d < monthStart;
  }).length;
  const deltaReelsPct = reelsMesPasado ? Math.round(((reelsEsteMes - reelsMesPasado) / reelsMesPasado) * 100) : undefined;

  type Pieza = LibraryContent & { estado_procesamiento?: string | null; publicado_at?: string | null };
  const piezas = videos as Pieza[];
  const modelosActivas = modelos.filter((m) => m.activa).length;
  const aprobadosSemana = piezas.filter(
    (v) => (v.estado === "aprobado" || v.estado === "publicado") && v.aprobado_at && new Date(v.aprobado_at).getTime() >= weekAgo,
  ).length;
  const publicados = piezas.filter((v) => v.estado === "publicado").length;
  const ahoraMs = Date.now();
  const programadas = piezas.filter((v) => v.estado === "aprobado" && v.publicado_at && new Date(v.publicado_at).getTime() > ahoraMs).length;
  const sinProgramar = piezas.filter((v) => v.estado === "aprobado" && !(v.publicado_at && new Date(v.publicado_at).getTime() > ahoraMs)).length;
  const etapas = [
    { label: "Editando", href: "/aprobacion?estado=editando", desc: "el editor IA los procesa", total: piezas.filter((v) => v.estado === "editando").length },
    { label: "En aprobación", href: "/aprobacion", desc: "esperan tu decisión", total: piezas.filter((v) => v.estado === "en_aprobacion").length },
    { label: "Sin programar", href: "/aprobacion?estado=aprobado", desc: "aprobados, para descargar", total: sinProgramar },
    { label: "Programados", href: "/aprobacion?estado=aprobado", desc: "en Publer", total: programadas },
    { label: "Publicados", href: "/aprobacion?estado=aprobado", desc: "ya en Instagram", total: piezas.filter((v) => v.estado === "publicado").length },
  ].map((e) => ({ ...e, estado: e.label }));
  const trialsSinProgramar = trials.filter((t) => t.estado === "aprobado" && !(t.publicado_at && new Date(t.publicado_at).getTime() > ahoraMs)).length;
  const trialsProgramados = trials.filter((t) => t.estado === "aprobado" && t.publicado_at && new Date(t.publicado_at).getTime() > ahoraMs).length;
  const trialsPublicados = trials.filter((t) => t.estado === "publicado").length;
  const maxEtapa = Math.max(1, ...etapas.map((e) => e.total));
  const rechazados = piezas.filter((v) => v.estado === "rechazado").length;
  const runnerPendiente = piezas.filter((v) => v.estado === "editando" && v.estado_procesamiento === "pendiente").length;
  const runnerProcesando = piezas.filter((v) => v.estado === "editando" && v.estado_procesamiento === "procesando").length;
  const runnerError = piezas.filter((v) => v.estado_procesamiento === "error").length;

  const aprobados = videos.filter((video) => video.estado === "aprobado" && withinPeriodo(video.aprobado_at ?? video.recibido_at)).length;
  const completados = videos.filter((video) => video.estado === "publicado" && withinPeriodo(video.aprobado_at ?? video.recibido_at)).length;
  const periodoLabel = periodo === "mes" ? "Este mes" : periodo === "semana" ? "Esta semana" : "Todo el tiempo";

  // Saludo dinamico
  const hour = now.getHours();
  const saludo = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";

  // Notificaciones
  const h24ago = Date.now() - 24 * 3600000;
  const d7ago = Date.now() - 7 * 24 * 3600000;
  const aprobacionUrgente = videos.filter(
    (v) => v.estado === "en_aprobacion" && new Date(v.recibido_at).getTime() < h24ago,
  );
  const rehacerPendientes = videos.filter(
    (v) => v.estado === "editando" && new Date(v.recibido_at).getTime() < h24ago,
  );
  const modelosSinMaterial = modelos.filter((m) => {
    const last = videos
      .filter((v) => v.modelo_id === m.id)
      .sort((a, b) => new Date(b.recibido_at).getTime() - new Date(a.recibido_at).getTime())[0];
    return !last || new Date(last.recibido_at).getTime() < d7ago;
  });
  type NotifNivel = "rojo" | "amarillo" | "verde";
  const notificaciones: { nivel: NotifNivel; texto: string; href?: string }[] = [
    ...(aprobacionUrgente.length > 0
      ? [{ nivel: "rojo" as NotifNivel, texto: `${aprobacionUrgente.length} vídeo${aprobacionUrgente.length > 1 ? "s" : ""} llevan más de 24h esperando aprobación`, href: "/aprobacion" }]
      : []),
    ...(rehacerPendientes.length > 0
      ? [{ nivel: "amarillo" as NotifNivel, texto: `${rehacerPendientes.length} vídeo${rehacerPendientes.length > 1 ? "s" : ""} en edición pendientes de procesar`, href: "/aprobacion" }]
      : []),
    ...(modelosSinMaterial.length > 0
      ? [{ nivel: "amarillo" as NotifNivel, texto: `Sin material nuevo en 7+ días: ${modelosSinMaterial.map((m) => m.nombre).join(", ")}` }]
      : []),
    ...(sinProgramar > 0
      ? [{ nivel: "amarillo" as NotifNivel, texto: publerActivo() ? `${sinProgramar} vídeo${sinProgramar > 1 ? "s" : ""} aprobado${sinProgramar > 1 ? "s" : ""} pendiente${sinProgramar > 1 ? "s" : ""} de programar en Publer` : `${sinProgramar} vídeo${sinProgramar > 1 ? "s" : ""} aprobado${sinProgramar > 1 ? "s" : ""} sin programar: Publer no está activo, descárgalo${sinProgramar > 1 ? "s" : ""} y súbelo${sinProgramar > 1 ? "s" : ""} tú`, href: "/aprobacion?estado=aprobado" }]
      : []),
    ...(runnerError > 0
      ? [{ nivel: "rojo" as NotifNivel, texto: `${runnerError} vídeo${runnerError > 1 ? "s" : ""} con error en el runner de edición`, href: "/aprobacion" }]
      : []),
    ...(enAprobacion > 0 && aprobacionUrgente.length === 0
      ? [{ nivel: "verde" as NotifNivel, texto: `${enAprobacion} vídeo${enAprobacion > 1 ? "s" : ""} listo${enAprobacion > 1 ? "s" : ""} para revisar`, href: "/aprobacion" }]
      : []),
  ];

  const totalBruto = facturacion.reduce((sum, row) => sum + Number(row.ingresos_brutos), 0);
  const totalComision = facturacion.reduce((sum, row) => sum + Number(row.comision_agencia), 0);
  const totalNeto = facturacion.reduce((sum, row) => sum + Number(row.neto_modelo), 0);

  const treintaDiasAtras = Date.now() - 30 * 24 * 3600000;
  const resumenCreadoras = modelos.map((modelo) => {
    const videosModelo = videos
      .filter((video) => video.modelo_id === modelo.id)
      .filter((video) => (creadorasPeriodo === "30d" ? new Date(video.recibido_at).getTime() >= treintaDiasAtras : true));
    const producidos = videosModelo.length;
    const aprobadosModelo = videosModelo.filter((v) => v.estado === "aprobado" || v.estado === "publicado").length;
    const publicadosModelo = videosModelo.filter((v) => v.estado === "publicado").length;
    const tasa = producidos ? Math.round((aprobadosModelo / producidos) * 100) : 0;
    return { modelo, producidos, aprobados: aprobadosModelo, publicados: publicadosModelo, tasa };
  });

  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">{saludo} 👋</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Panel de Administracion</h1>
      </div>

      {notificaciones.length > 0 ? (
        <div className="mb-6 flex flex-col gap-2">
          {notificaciones.map((n, i) => {
            const colors = {
              rojo: "border-red-500/40 bg-red-950/30 text-red-300",
              amarillo: "border-amber-500/40 bg-amber-950/30 text-amber-300",
              verde: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
            } as const;
            const dots = { rojo: "bg-red-400", amarillo: "bg-amber-400", verde: "bg-emerald-400" } as const;
            const inner = (
              <div key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${colors[n.nivel]}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${dots[n.nivel]}`} />
                <span className="flex-1">{n.texto}</span>
                {n.href ? <span className="text-xs opacity-60">Ver &rarr;</span> : null}
              </div>
            );
            return n.href ? <a key={i} href={n.href}>{inner}</a> : inner;
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Modelos activas" value={modelosActivas} icon={Users} subtitle={`de ${modelos.length} registradas`} />
        <StatTile label="Vídeos en sistema" value={videos.length} icon={Clapperboard} subtitle="en total" />
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

        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Wallet className="h-5 w-5 text-[color:var(--accent-2)]" /> Facturacion del mes
            </h2>
            <Link href="/facturacion" className="text-xs font-semibold text-[#A78BFA] hover:underline">
              Ver detalle →
            </Link>
          </div>
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
        </GlassCard>
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
