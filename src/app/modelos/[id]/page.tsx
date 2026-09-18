import { notFound } from "next/navigation";
import Link from "next/link";
import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { estadoLabel, formatCurrency, formatDate } from "@/lib/utils";

export const revalidate = 0;

const ESTADO_BADGE: Record<string, string> = {
  recibido: "badge-recibido",
  clasificando: "badge-clasificando",
  en_reparto: "badge-en_reparto",
  editando: "badge-editando",
  en_aprobacion: "badge-en_aprobacion",
  aprobado: "badge-aprobado",
  publicado: "badge-publicado",
  rechazado: "badge-rechazado",
};

type CuentaDetail = {
  id: string;
  username: string;
  seguidores?: number | null;
  activa?: boolean | null;
  publicadosMes: number;
  lastPublished: string | null;
  diasSinPublicar: number | null;
};

type ModeloRow = {
  id: string;
  nombre: string;
  activa?: boolean | null;
  created_at?: string | null;
};

type PipelineRow = {
  id: string;
  titulo?: string | null;
  tipo_video?: string | null;
  estado: string;
  recibido_at: string;
};

type PublicacionRow = {
  id: string;
  titulo?: string | null;
  tipo_video?: string | null;
  publicado_at: string;
  cuenta_id?: string | null;
  cuentas_instagram?: { username?: string | null } | null;
};

type FacturacionRow = {
  periodo_inicio: string;
  ingresos_brutos: number;
  comision_agencia: number;
  suscriptores_activos?: number | null;
};

async function getModeloDetail(id: string) {
  if (!canUseSupabase()) return null;

  const supabase = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const [{ data: modelo }, { data: cuentas }, { data: pipeline }, { data: ultimasPublicaciones }, { data: facturacionHistorica }] = await Promise.all([
    supabase.from("modelos").select("*").eq("id", id).single(),
    supabase.from("cuentas_instagram").select("id, username, seguidores, activa").eq("modelo_id", id),
    supabase.from("library_content").select("id, titulo, tipo_video, estado, recibido_at").eq("modelo_id", id).not("estado", "in", "(publicado,archivado)").order("recibido_at", { ascending: false }).limit(20),
    supabase.from("library_content").select("id, titulo, tipo_video, publicado_at, cuenta_id, cuentas_instagram(username)").eq("modelo_id", id).eq("estado", "publicado").order("publicado_at", { ascending: false }).limit(15),
    supabase.from("facturacion_modelos").select("periodo_inicio, ingresos_brutos, comision_agencia, suscriptores_activos").eq("modelo_id", id).order("periodo_inicio", { ascending: false }).limit(6),
  ]);
  if (!modelo) return null;

  const { data: pubMesData } = await supabase.from("library_content").select("cuenta_id").eq("modelo_id", id).eq("estado", "publicado").gte("publicado_at", monthStart);
  const pubMesByCuenta: Record<string, number> = {};
  ((pubMesData ?? []) as Array<{ cuenta_id?: string | null }>).forEach((row) => {
    if (row.cuenta_id) pubMesByCuenta[row.cuenta_id] = (pubMesByCuenta[row.cuenta_id] || 0) + 1;
  });
  const lastPubByCuenta: Record<string, string> = {};
  ((ultimasPublicaciones ?? []) as PublicacionRow[]).forEach((publicacion) => {
    if (publicacion.cuenta_id && !lastPubByCuenta[publicacion.cuenta_id]) lastPubByCuenta[publicacion.cuenta_id] = publicacion.publicado_at;
  });

  return {
    modelo: modelo as ModeloRow,
    pipeline: (pipeline ?? []) as PipelineRow[],
    ultimasPublicaciones: (ultimasPublicaciones ?? []) as unknown as PublicacionRow[],
    facturacion: (facturacionHistorica ?? []) as FacturacionRow[],
    cuentas: ((cuentas ?? []) as Array<{ id: string; username: string; seguidores?: number | null; activa?: boolean | null }>).map((cuenta) => ({
      ...cuenta,
      publicadosMes: pubMesByCuenta[cuenta.id] || 0,
      lastPublished: lastPubByCuenta[cuenta.id] || null,
      diasSinPublicar: lastPubByCuenta[cuenta.id] ? Math.floor((now.getTime() - new Date(lastPubByCuenta[cuenta.id]).getTime()) / 86400000) : null,
    })) satisfies CuentaDetail[],
  };
}

export default async function ModeloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getModeloDetail(id);
  if (!data) notFound();

  const { modelo, cuentas, pipeline, ultimasPublicaciones, facturacion } = data;
  const facturacionMes = facturacion[0];

  return (
    <PanelLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/modelos" className="text-sm text-halo-subtle hover:text-halo-text">
            ← Modelos
          </Link>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-halo-accent/30 bg-halo-accent/20">
            <span className="font-display text-lg font-bold text-halo-accent">{modelo.nombre.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-halo-text">{modelo.nombre}</h1>
            <p className="text-sm text-halo-subtle">Alta: {formatDate(modelo.created_at)}</p>
          </div>
          <span className={`badge ml-auto ${modelo.activa ? "bg-green-500/20 text-green-400" : "bg-halo-muted text-halo-subtle"}`}>{modelo.activa ? "Activa" : "Inactiva"}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card"><div className="mb-1 text-xs uppercase tracking-wider text-halo-subtle">Ingresos mes</div><div className="font-display text-2xl font-bold text-halo-text">{facturacionMes ? formatCurrency(Number(facturacionMes.ingresos_brutos)) : "—"}</div></div>
          <div className="card"><div className="mb-1 text-xs uppercase tracking-wider text-halo-subtle">Comision</div><div className="font-display text-2xl font-bold text-halo-accent">{facturacionMes ? formatCurrency(Number(facturacionMes.comision_agencia)) : "—"}</div></div>
          <div className="card"><div className="mb-1 text-xs uppercase tracking-wider text-halo-subtle">Suscriptores</div><div className="font-display text-2xl font-bold text-halo-text">{facturacionMes?.suscriptores_activos?.toLocaleString("es") ?? "—"}</div></div>
          <div className="card"><div className="mb-1 text-xs uppercase tracking-wider text-halo-subtle">En pipeline</div><div className="font-display text-2xl font-bold text-halo-text">{pipeline.length}</div></div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Cuentas Instagram</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cuentas.map((cuenta) => {
              const urgencia = cuenta.diasSinPublicar === null ? "unknown" : cuenta.diasSinPublicar >= 7 ? "critical" : cuenta.diasSinPublicar >= 4 ? "warning" : "ok";
              return (
                <div key={cuenta.id} className={`card flex flex-col gap-3 ${urgencia === "critical" ? "border-red-500/30" : urgencia === "warning" ? "border-amber-500/30" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-mono font-semibold text-halo-text">@{cuenta.username}</div>
                    <span className={`badge text-xs ${urgencia === "critical" ? "bg-red-500/15 text-red-400" : urgencia === "warning" ? "bg-amber-500/15 text-amber-400" : urgencia === "ok" ? "bg-green-500/15 text-green-400" : "bg-halo-muted text-halo-subtle"}`}>
                      {cuenta.diasSinPublicar === null ? "Sin datos" : cuenta.diasSinPublicar === 0 ? "Publico hoy" : `${cuenta.diasSinPublicar}d sin publicar`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded bg-halo-muted/40 p-2"><div className={`font-mono text-lg font-bold ${cuenta.publicadosMes < 4 ? "text-red-400" : "text-halo-text"}`}>{cuenta.publicadosMes}</div><div className="text-xs text-halo-subtle">Publicados (mes)</div></div>
                    <div className="rounded bg-halo-muted/40 p-2"><div className="font-mono text-lg font-bold text-halo-text">{cuenta.seguidores ? `${(cuenta.seguidores / 1000).toFixed(1)}k` : "—"}</div><div className="text-xs text-halo-subtle">Seguidores</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Pipeline ({pipeline.length})</h2>
            {pipeline.length === 0 ? <p className="text-sm text-halo-subtle">Vacio</p> : (
              <div className="space-y-2">{pipeline.map((video) => (
                <div key={video.id} className="flex items-center gap-3 border-b border-halo-border py-1.5 last:border-0">
                  <span className={`badge flex-shrink-0 ${ESTADO_BADGE[video.estado] ?? "badge"}`}>{estadoLabel(video.estado)}</span>
                  <span className="flex-1 truncate text-sm text-halo-text">{video.titulo ?? `#${video.id.slice(-6)}`}</span>
                  <span className="font-mono text-xs text-halo-subtle">{formatDate(video.recibido_at)}</span>
                </div>
              ))}</div>
            )}
          </div>
          <div className="card">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Ultimas publicaciones</h2>
            {ultimasPublicaciones.length === 0 ? <p className="text-sm text-halo-subtle">Sin publicaciones</p> : (
              <div className="space-y-2">{ultimasPublicaciones.map((publicacion) => (
                <div key={publicacion.id} className="flex items-center gap-3 border-b border-halo-border py-1.5 last:border-0">
                  <span className="w-20 font-mono text-xs text-halo-subtle">{formatDate(publicacion.publicado_at, "dd MMM yy")}</span>
                  <span className="flex-1 truncate text-sm text-halo-text">{publicacion.titulo ?? `#${publicacion.id.slice(-6)}`}</span>
                  {publicacion.cuentas_instagram?.username ? <span className="font-mono text-xs text-halo-subtle">@{publicacion.cuentas_instagram.username}</span> : null}
                </div>
              ))}</div>
            )}
          </div>
        </div>
      </div>
    </PanelLayout>
  );
}
