import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AtSign, CheckCircle2, Clapperboard, Clock3, Scissors, TrendingUp, Users, Wallet } from "lucide-react";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { RefreshButton } from "@/components/RefreshButton";
import { StatTile } from "@/components/StatTile";
import { PeriodoSelect } from "./PeriodoSelect";
import { CreadorasFilter } from "./CreadorasFilter";
import { sampleFacturacion, sampleModelos, sampleVideos } from "@/lib/data";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { FacturacionModelo, LibraryContent, Modelo } from "@/types";

export const dynamic = "force-dynamic";

type WithModelName<T> = T & { modelos?: { nombre?: string | null } | null };

async function loadDashboardData() {
  if (!canUseSupabase()) {
    return { videos: sampleVideos, modelos: sampleModelos, facturacion: sampleFacturacion };
  }

  try {
    const supabase = createAdminClient();
    const [videosResult, modelosResult, facturacionResult] = await Promise.all([
      supabase.from("library_content").select("*, modelos(nombre)").order("recibido_at", { ascending: false }).limit(50),
      supabase.from("modelos").select("*"),
      supabase.from("facturacion_modelos").select("*, modelos(nombre)").order("periodo_inicio", { ascending: false }),
    ]);

    const videos = ((videosResult.data ?? []) as Array<WithModelName<LibraryContent>>).map((video) => ({
      ...video,
      modelo_nombre: video.modelos?.nombre ?? "Sin modelo",
    })) as LibraryContent[];
    const facturacion = ((facturacionResult.data ?? []) as Array<WithModelName<FacturacionModelo>>).map((row) => ({
      ...row,
      modelo_nombre: row.modelos?.nombre ?? "Sin modelo",
    })) as FacturacionModelo[];

    return {
      videos: videos.length ? videos : sampleVideos,
      modelos: ((modelosResult.data ?? []) as Modelo[]).length ? (modelosResult.data as Modelo[]) : sampleModelos,
      facturacion: facturacion.length ? facturacion : sampleFacturacion,
    };
  } catch {
    return { videos: sampleVideos, modelos: sampleModelos, facturacion: sampleFacturacion };
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

  const [{ videos, modelos, facturacion }, cuentasReales] = await Promise.all([loadDashboardData(), loadCuentasInstagramReales()]);
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
  const porEditar = videos.filter((video) => ["clasificando", "en_reparto", "editando"].includes(video.estado)).length;
  const reelsEsteMes = videos.filter((video) => new Date(video.recibido_at) >= monthStart).length;
  const reelsMesPasado = videos.filter((video) => {
    const d = new Date(video.recibido_at);
    return d >= lastMonthStart && d < monthStart;
  }).length;
  const deltaReelsPct = reelsMesPasado ? Math.round(((reelsEsteMes - reelsMesPasado) / reelsMesPasado) * 100) : undefined;

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
        <p className="text-sm text-[color:var(--text-secondary)]">{saludo}, Alex 👋</p>
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Creadores" value={modelos.length} icon={Users} subtitle="modelos registradas" />
        <StatTile label="Reels" value={videos.length} icon={Clapperboard} subtitle="videos en el sistema" />
        <StatTile
          label="Por revisar"
          value={enAprobacion}
          icon={Clock3}
          glow={enAprobacion > 0 ? "purple" : undefined}
          subtitle="en mesa de aprobacion"
        />
        <StatTile label="Por editar" value={porEditar} icon={Scissors} subtitle="para editores" />
      </div>

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
              {cuentasIG.map((cuenta) => {
                const vistas30d = cuenta.reels.reduce((sum, reel) => sum + reel.visitas, 0);
                const score = Math.round(vistas30d / Math.max(1, cuenta.publicaciones));
                return (
                  <tr key={cuenta.id}>
                    <td className="px-5 py-3 text-white/85">{cuenta.modelo_nombre}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="font-code text-white/85">@{cuenta.username}</span>{" "}
                      <span className={`badge whitespace-nowrap text-[9px] ${cuenta.metricool_estado === "conectada" ? "badge-aprobado" : ""}`}>
                        {cuenta.metricool_estado === "conectada" ? "Metricool" : "Solo scraping"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-white/85">{formatNumber(cuenta.seguidores)}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${cuenta.ganancia_hoy >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {cuenta.ganancia_hoy >= 0 ? "+" : ""}
                      {formatNumber(cuenta.ganancia_hoy)}
                    </td>
                    <td className="px-5 py-3 text-right text-white/85">{formatNumber(vistas30d)}</td>
                    <td className="px-5 py-3 text-right text-white/85">{formatNumber(score)}</td>
                    <td className="px-5 py-3 text-right text-white/85">{cuenta.publicaciones}</td>
                    <td className="px-5 py-3 text-right text-white/85">{cuenta.reels_30d_count}</td>
                    <td className="px-5 py-3 text-right text-white/40">
                      {now.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
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
