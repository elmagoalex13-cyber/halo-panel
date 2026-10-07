import { notFound } from "next/navigation";
import Link from "next/link";
import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { PortalAccesoButton } from "../PortalAccesoButton";
import { FichaTabs, type Pestana } from "./FichaTabs";
import { FotoModelo } from "../FotoModelo";
import { versionesFotos } from "@/lib/fotosModelos";
import { OnboardingFicha } from "./OnboardingFicha";
import { ContenidoModelo, type VideoInstagram } from "./ContenidoModelo";
import { cargarResumenOF } from "@/lib/ofResumen";
import { urlR2 } from "@/lib/media";
import { progresoOnboarding, sanearDatos } from "@/lib/onboarding";
import type { SocialNetwork } from "@/types";
import { estadoLabel, formatCurrency, formatDate } from "@/lib/utils";
import { alcanceActual, veModelo } from "@/lib/alcance";

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

const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  twitter: "Twitter / X",
  tiktok: "TikTok",
};

function urlCuenta(red: SocialNetwork, username: string, url?: string | null) {
  if (url && /^https?:\/\//i.test(url.trim())) return url.trim();
  const u = username.replace(/^@/, "").trim();
  if (red === "tiktok") return `https://www.tiktok.com/@${u}`;
  if (red === "twitter") return `https://x.com/${u}`;
  return `https://www.instagram.com/${u}/`;
}

function inferSocial(redSocial?: SocialNetwork | null, url?: string | null): SocialNetwork {
  if (redSocial) return redSocial;
  if (/tiktok\.com/i.test(url ?? "")) return "tiktok";
  if (/(twitter\.com|x\.com)/i.test(url ?? "")) return "twitter";
  return "instagram";
}

type CuentaDetail = {
  id: string;
  username: string;
  red_social?: SocialNetwork | null;
  url?: string | null;
  seguidores?: number | null;
  activa?: boolean | null;
  publicadosMes: number;
  lastPublished: string | null;
  diasSinPublicar: number | null;
};

type Encargo = { id: string; tipo_video: string | null; estado: string; instrucciones: string | null; fecha_limite: string | null; created_at: string };

type ModeloRow = {
  id: string;
  nombre: string;
  nombre_real?: string | null;
  email?: string | null;
  telefono?: string | null;
  porcentaje_comision?: number | null;
  notas?: string | null;
  portal_token?: string | null;
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
  if (!veModelo(await alcanceActual(), id)) return null; // modelo no compartida: para tu socio no existe

  const supabase = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const [{ data: modelo }, { data: cuentas }, { data: pipeline }, { data: ultimasPublicaciones }, { data: facturacionHistorica }, { data: encargos }, { data: conteo }, { data: onboardingRow }, { data: onboardingHistorial }, fotos] = await Promise.all([
    supabase.from("modelos").select("*").eq("id", id).single(),
    supabase.from("cuentas_instagram").select("*").eq("modelo_id", id),
    supabase.from("library_content").select("id, titulo, tipo_video, estado, recibido_at").eq("modelo_id", id).not("estado", "in", "(publicado,archivado)").order("recibido_at", { ascending: false }).limit(20),
    supabase.from("library_content").select("id, titulo, tipo_video, publicado_at, cuenta_id, cuentas_instagram(username)").eq("modelo_id", id).eq("estado", "publicado").order("publicado_at", { ascending: false }).limit(15),
    supabase.from("facturacion_modelos").select("periodo_inicio, ingresos_brutos, comision_agencia, suscriptores_activos").eq("modelo_id", id).order("periodo_inicio", { ascending: false }).limit(6),
    supabase.from("encargos").select("id, tipo_video, estado, instrucciones, fecha_limite, created_at").eq("modelo_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("library_content").select("estado").eq("modelo_id", id),
    supabase.from("modelo_onboarding").select("datos, estado, enviado_at, updated_at").eq("modelo_id", id).maybeSingle(),
    supabase.from("modelo_onboarding_historial").select("id, origen, created_at").eq("modelo_id", id).order("created_at", { ascending: false }).limit(50),
    versionesFotos(),
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

  const porEstado: Record<string, number> = {};
  ((conteo ?? []) as Array<{ estado: string }>).forEach((v) => {
    porEstado[v.estado] = (porEstado[v.estado] || 0) + 1;
  });

  return {
    fotoVersion: fotos[id] ?? null,
    onboarding: (onboardingRow ?? null) as { datos: unknown; estado: string; enviado_at: string | null; updated_at: string } | null,
    onboardingHistorial: (onboardingHistorial ?? []) as Array<{ id: string; origen: string; created_at: string }>,
    encargos: (encargos ?? []) as Encargo[],
    porEstado,
    totalVideos: (conteo ?? []).length,
    modelo: modelo as ModeloRow,
    pipeline: (pipeline ?? []) as PipelineRow[],
    ultimasPublicaciones: (ultimasPublicaciones ?? []) as unknown as PublicacionRow[],
    facturacion: (facturacionHistorica ?? []) as FacturacionRow[],
    cuentas: ((cuentas ?? []) as Array<{ id: string; username: string; red_social?: SocialNetwork | null; url?: string | null; seguidores?: number | null; activa?: boolean | null }>).map((cuenta) => ({
      ...cuenta,
      red_social: inferSocial(cuenta.red_social, cuenta.url),
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

  const { modelo, cuentas, pipeline, ultimasPublicaciones, facturacion, encargos, porEstado, totalVideos, onboarding, onboardingHistorial, fotoVersion } = data;
  const onboardingDatos = sanearDatos(onboarding?.datos ?? {});
  const pendientes = encargos.filter((e) => e.estado !== "entregado");
  const facturacionMes = facturacion[0];

  const pctOnboarding = progresoOnboarding(onboardingDatos);
  const onboardingEnviado = onboarding?.estado === "enviado";

  const kpis: Array<[string, string, string?]> = [
    ["Ingresos mes", facturacionMes ? formatCurrency(Number(facturacionMes.ingresos_brutos)) : "—"],
    ["Comisión", facturacionMes ? formatCurrency(Number(facturacionMes.comision_agencia)) : "—", "text-halo-accent"],
    ["Suscriptores", facturacionMes?.suscriptores_activos?.toLocaleString("es") ?? "—"],
    ["En pipeline", String(pipeline.length)],
  ];

  const resumen = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card !p-4 lg:col-span-2">
        <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">Ficha</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {[
            ["Nombre real", modelo.nombre_real],
            ["Email", modelo.email],
            ["Teléfono", modelo.telefono],
            ["Comisión agencia", modelo.porcentaje_comision != null ? `${modelo.porcentaje_comision}%` : null],
            ["Portal", modelo.portal_token ? `/m/${modelo.portal_token}` : "Sin acceso creado"],
            ["Notas", modelo.notas],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[11px] uppercase tracking-wider text-halo-subtle">{k}</dt>
              <dd className="mt-0.5 break-words text-halo-text">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-halo-border pt-3">
          <span className="badge">{totalVideos} vídeos en total</span>
          {Object.entries(porEstado).map(([estado, n]) => (
            <span key={estado} className={`badge ${ESTADO_BADGE[estado] ?? ""}`}>
              {n} {estadoLabel(estado).toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <a href="#onboarding" className="card block !p-4 transition hover:border-[#8B5CF6]/40">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">Onboarding</h2>
            <span className={`badge ${onboardingEnviado ? "bg-green-500/20 text-green-400" : onboarding ? "bg-amber-500/15 text-amber-300" : ""}`}>
              {onboardingEnviado ? "Enviado" : onboarding ? "A medias" : "Sin empezar"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA]" style={{ width: `${pctOnboarding}%` }} />
          </div>
          <p className="mt-2 text-xs text-halo-subtle">{pctOnboarding}% de lo obligatorio · ver respuestas →</p>
        </a>
        <a href="#videos" className="card block !p-4 transition hover:border-[#8B5CF6]/40">
          <h2 className="mb-1 font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">Por grabar</h2>
          <p className="font-display text-3xl font-semibold text-halo-text">{pendientes.length}</p>
          <p className="text-xs text-halo-subtle">referencias pendientes · ver vídeos →</p>
        </a>
      </div>
    </div>
  );

  const videos = (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <ListaCard titulo="Pendientes de grabar" total={pendientes.length} vacio="No tiene referencias asignadas. Asígnalas desde Instagram → Referencias.">
        {pendientes.map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-halo-border py-1.5 last:border-0">
            <span className="badge badge-editando flex-shrink-0">Pendiente</span>
            <span className="flex-1 truncate text-sm text-halo-text">{e.instrucciones || (e.tipo_video ? `Tipo ${e.tipo_video.replace(/\D/g, "")}` : "Con referencia")}</span>
            <span className="font-mono text-xs text-halo-subtle">{formatDate(e.created_at)}</span>
          </div>
        ))}
      </ListaCard>

      <ListaCard titulo="Pipeline" total={pipeline.length} vacio="Vacío">
        {pipeline.map((video) => (
          <div key={video.id} className="flex items-center gap-3 border-b border-halo-border py-1.5 last:border-0">
            <span className={`badge flex-shrink-0 ${ESTADO_BADGE[video.estado] ?? "badge"}`}>{estadoLabel(video.estado)}</span>
            <span className="flex-1 truncate text-sm text-halo-text">{video.titulo ?? `#${video.id.slice(-6)}`}</span>
            <span className="font-mono text-xs text-halo-subtle">{formatDate(video.recibido_at)}</span>
          </div>
        ))}
      </ListaCard>

      <ListaCard titulo="Últimas publicaciones" total={ultimasPublicaciones.length} vacio="Sin publicaciones">
        {ultimasPublicaciones.map((publicacion) => (
          <div key={publicacion.id} className="flex items-center gap-3 border-b border-halo-border py-1.5 last:border-0">
            <span className="w-20 font-mono text-xs text-halo-subtle">{formatDate(publicacion.publicado_at, "dd MMM yy")}</span>
            <span className="flex-1 truncate text-sm text-halo-text">{publicacion.titulo ?? `#${publicacion.id.slice(-6)}`}</span>
            {publicacion.cuentas_instagram?.username ? <span className="font-mono text-xs text-halo-subtle">@{publicacion.cuentas_instagram.username}</span> : null}
          </div>
        ))}
      </ListaCard>
    </div>
  );

  const redes = cuentas.length ? (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cuentas.map((cuenta) => {
        const urgencia = cuenta.diasSinPublicar === null ? "unknown" : cuenta.diasSinPublicar >= 7 ? "critical" : cuenta.diasSinPublicar >= 4 ? "warning" : "ok";
        const red = cuenta.red_social ?? "instagram";
        return (
          <div key={cuenta.id} className={`card flex flex-col gap-3 !p-4 ${urgencia === "critical" ? "border-red-500/30" : urgencia === "warning" ? "border-amber-500/30" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <a href={urlCuenta(red, cuenta.username, cuenta.url)} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-halo-text hover:text-halo-accent">
                  @{cuenta.username} <span aria-hidden="true">↗</span>
                </a>
                <div className="mt-1 text-xs text-halo-subtle">{SOCIAL_LABEL[red]}</div>
              </div>
              {red === "instagram" ? (
                <span className={`badge text-xs ${urgencia === "critical" ? "bg-red-500/15 text-red-400" : urgencia === "warning" ? "bg-amber-500/15 text-amber-400" : urgencia === "ok" ? "bg-green-500/15 text-green-400" : "bg-halo-muted text-halo-subtle"}`}>
                  {cuenta.diasSinPublicar === null ? "Sin datos" : cuenta.diasSinPublicar === 0 ? "Publicó hoy" : `${cuenta.diasSinPublicar}d sin publicar`}
                </span>
              ) : (
                <span className={`badge text-xs ${cuenta.activa ? "bg-green-500/15 text-green-400" : "bg-halo-muted text-halo-subtle"}`}>{cuenta.activa ? "Activa" : "Pausada"}</span>
              )}
            </div>
            <a
              href={urlCuenta(red, cuenta.username, cuenta.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full py-2 text-center text-xs font-semibold"
            >
              Abrir en {SOCIAL_LABEL[red]} ↗
            </a>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-halo-muted/40 p-2">
                <div className={`font-mono text-lg font-bold ${cuenta.publicadosMes < 4 ? "text-red-400" : "text-halo-text"}`}>{cuenta.publicadosMes}</div>
                <div className="text-xs text-halo-subtle">Publicados (mes)</div>
              </div>
              <div className="rounded bg-halo-muted/40 p-2">
                <div className="font-mono text-lg font-bold text-halo-text">{cuenta.seguidores ? `${(cuenta.seguidores / 1000).toFixed(1)}k` : "—"}</div>
                <div className="text-xs text-halo-subtle">Seguidores</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="card py-8 text-center text-sm text-halo-subtle">Esta modelo no tiene cuentas de redes todavía.</div>
  );

  // Todo el contenido de la modelo: videos editados de Instagram + scripts/packs/posts de OnlyFans
  const { data: filasIG } = await createAdminClient()
    .from("library_content")
    .select("id, titulo, estado, recibido_at, publicado_at, video_procesado_url, tipo")
    .eq("modelo_id", modelo.id)
    .in("estado", ["en_aprobacion", "aprobado", "publicado"])
    .not("video_procesado_url", "is", null)
    .or("tipo.is.null,tipo.neq.5")
    .order("recibido_at", { ascending: false })
    .limit(80);
  const instagram: VideoInstagram[] = ((filasIG ?? []) as Array<{ id: string; titulo: string | null; estado: string; recibido_at: string; publicado_at: string | null; video_procesado_url: string | null }>)
    .map((v) => ({ id: v.id, titulo: v.titulo, estado: v.estado, recibido_at: v.recibido_at, publicado_at: v.publicado_at, url: urlR2(v.video_procesado_url) ?? "" }))
    .filter((v) => v.url);
  const of = await cargarResumenOF(modelo.id);
  const ofNuevos = of.resumen.filter((c) => c.nuevo).length;

  const pestanas: Pestana[] = [
    { id: "resumen", label: "Resumen", icono: "◈", contenido: resumen },
    {
      id: "onboarding",
      label: "Onboarding",
      icono: "📝",
      aviso: onboarding ? (onboardingEnviado ? null : "a medias") : "nuevo",
      contenido: <OnboardingFicha modelo={{ id: modelo.id, nombre: modelo.nombre }} onboarding={onboarding} datos={onboardingDatos} historial={onboardingHistorial} />,
    },
    { id: "videos", label: "Vídeos", icono: "🎞", aviso: pendientes.length ? String(pendientes.length) : null, contenido: videos },
    { id: "redes", label: "Redes", icono: "◎", aviso: cuentas.length ? String(cuentas.length) : null, contenido: redes },
    {
      id: "contenido",
      label: "Contenido",
      icono: "🗂",
      aviso: ofNuevos ? `${ofNuevos} nuevo${ofNuevos === 1 ? "" : "s"}` : null,
      contenido: <ContenidoModelo modelo={{ id: modelo.id, nombre: modelo.nombre, foto: of.modelos[0]?.foto ?? null }} instagram={instagram} onlyfans={of.resumen} />,
    },
  ];

  return (
    <PanelLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/modelos" className="text-sm text-halo-subtle hover:text-halo-text">
            ← Modelos
          </Link>
          <FotoModelo modeloId={modelo.id} nombre={modelo.nombre} version={fotoVersion} className="h-14 w-14 rounded-full text-lg" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold text-halo-text">{modelo.nombre}</h1>
            <p className="text-xs text-halo-subtle">Alta: {formatDate(modelo.created_at)}</p>
          </div>
          <span className={`badge ${modelo.activa ? "bg-green-500/20 text-green-400" : "bg-halo-muted text-halo-subtle"}`}>{modelo.activa ? "Activa" : "Inactiva"}</span>
          <div className="ml-auto">
            <PortalAccesoButton modeloId={modelo.id} nombre={modelo.nombre} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {kpis.map(([label, value, color]) => (
            <div key={label} className="card !p-3">
              <div className="truncate text-[10px] uppercase tracking-wider text-halo-subtle sm:text-xs">{label}</div>
              <div className={`mt-0.5 truncate font-display text-base font-bold sm:text-xl ${color ?? "text-halo-text"}`}>{value}</div>
            </div>
          ))}
        </div>

        <FichaTabs pestanas={pestanas} inicial="resumen" />
      </div>
    </PanelLayout>
  );
}

// Lista compacta: muestra las primeras filas y deja el resto plegado, para que la ficha no se haga interminable.
function ListaCard({ titulo, total, vacio, children, max = 6 }: { titulo: string; total: number; vacio: string; children: React.ReactNode[]; max?: number }) {
  const filas = Array.isArray(children) ? children : [children];
  const visibles = filas.slice(0, max);
  const resto = filas.slice(max);
  return (
    <div className="card !p-4">
      <h2 className="mb-3 flex items-center justify-between font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">
        {titulo}
        <span className="badge">{total}</span>
      </h2>
      {filas.length === 0 ? (
        <p className="text-sm text-halo-subtle">{vacio}</p>
      ) : (
        <>
          <div>{visibles}</div>
          {resto.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer py-1.5 text-xs font-semibold text-halo-accent">Ver {resto.length} más</summary>
              <div>{resto}</div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
