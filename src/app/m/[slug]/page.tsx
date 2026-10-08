import { notFound } from "next/navigation";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { urlR2 } from "@/lib/media";
import { LoginForm } from "./LoginForm";
import { accesosCompletos } from "@/lib/accesosModelo";
import { PortalClient, type Pendiente, type Entrega } from "./PortalClient";
import { sanearDatos } from "@/lib/onboarding";
import type { ArchivoOF, ColeccionOF } from "@/lib/onlyfans";
import { urlVista } from "@/lib/r2/onlyfans";
import type { ArchivoVista } from "./OnlyFansPortal";
import { modeloEliminada } from "@/lib/papelera";
import { progresoCaptacion } from "@/lib/captacion";
import { CLAVE_GUIA } from "@/lib/guiaOF";
import type { ReferenciaVista } from "./GuiaOF";
import { estadoTelegramModelo } from "@/lib/telegramModelo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi portal" };

type RefRow = {
  id: string;
  url_original: string | null;
  url_r2: string | null;
  thumbnail_url: string | null;
  descripcion: string | null;
  tipo_video: string | null;
};

function refVista(r: RefRow | null) {
  return r
    ? {
        id: r.id,
        video: urlR2(r.url_r2),
        thumb: urlR2(r.thumbnail_url) ?? r.thumbnail_url,
        instagram: r.url_original,
        descripcion: r.descripcion,
      }
    : null;
}

export default async function PortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!canUseSupabase()) notFound();
  const supabase = createAdminClient();

  const { data: modelo } = await supabase
    .from("modelos")
    .select("id, nombre, activa, ambito")
    .eq("portal_token", slug)
    .maybeSingle();
  if (!modelo || !modelo.activa || (await modeloEliminada(modelo.id as string))) notFound();

  const sesion = await sesionActual(slug);
  if (!sesion || sesion.modeloId !== modelo.id) return <LoginForm slug={slug} nombre={modelo.nombre} />;

  // El portal NUNCA se bloquea. Los accesos se piden dentro del formulario de su perfil (se guardan cifrados en el Vault):
  // modelos PRIVADAS (del dueño) -> solo OnlyFans; modelos COMPARTIDAS (con el socio) -> OnlyFans y Skrill.
  const modoAccesos: "of" | "completo" = modelo.ambito === "compartido" ? "completo" : "of";
  const accesos = { modo: modoAccesos, dado: await accesosCompletos(modelo.id as string, modoAccesos) };

  // Contenido de OnlyFans de esta modelo (si las tablas aun no existen, la pestaña no aparece)
  const [ofColRes, ofArcRes] = await Promise.all([
    supabase.from("of_colecciones").select("*").eq("modelo_id", modelo.id).order("created_at", { ascending: false }),
    supabase
      .from("of_archivos")
      .select("id, coleccion_id, fase, slot, tipo_archivo, orden, nombre_original, mime, size_bytes, duracion_seg, descargado_at, subido_of_at, created_at, storage_key, bucket")
      .eq("modelo_id", modelo.id)
      .order("created_at", { ascending: true })
      .limit(3000),
  ]);
  let contenidoOF: { colecciones: ColeccionOF[]; archivos: ArchivoVista[] } | null = null;
  if (!ofColRes.error && !ofArcRes.error) {
    const filas = (ofArcRes.data ?? []) as Array<ArchivoOF & { storage_key: string; bucket: string }>;
    const archivos: ArchivoVista[] = await Promise.all(
      filas.map(async ({ storage_key, bucket, ...a }) => ({
        ...a,
        vista: a.tipo_archivo === "foto" ? await urlVista(storage_key, bucket).catch(() => null) : null,
      })),
    );
    contenidoOF = { colecciones: (ofColRes.data ?? []) as ColeccionOF[], archivos };
  }

  const [encargosRes, entregasRes, onboardingRes] = await Promise.all([
    supabase
      .from("encargos")
      .select("id, tipo_video, estado, instrucciones, fecha_limite, created_at, referencia:referencias(id, url_original, url_r2, thumbnail_url, descripcion, tipo_video)")
      .eq("modelo_id", modelo.id)
      .neq("estado", "entregado")
      .neq("estado", "cancelado")
      .order("created_at", { ascending: true }),
    supabase
      .from("library_content")
      .select("id, titulo, tipo, recibido_at")
      .eq("modelo_id", modelo.id)
      .like("r2_key", `bruto/${modelo.id}/%`)
      // Los fragmentos de 6 s que se sacan de una misma subida (titulo "... · parte 2/5") no cuentan como subidas nuevas.
      .or("titulo.is.null,titulo.not.ilike.*· parte *")
      .order("recibido_at", { ascending: false })
      .limit(12),
    supabase.from("modelo_onboarding").select("datos, estado").eq("modelo_id", modelo.id).maybeSingle(),
  ]);

  const pendientes: Pendiente[] = ((encargosRes.data ?? []) as unknown as Array<{
    id: string;
    tipo_video: string | null;
    instrucciones: string | null;
    fecha_limite: string | null;
    referencia: RefRow | null;
  }>).map((e) => ({
    id: e.id,
    tipo: Number(String(e.tipo_video ?? "").match(/[1-4]/)?.[0] ?? 1),
    instrucciones: e.instrucciones,
    fecha_limite: e.fecha_limite,
    referencia: refVista(e.referencia),
  }));

  let entregas = (entregasRes.data ?? []) as Entrega[];

  // Captacion: lo que le falta para poder crearle la cuenta de Instagram (reels, scripts, packs y posts) y el feedback sobre sus reels
  let captacion: { progreso: NonNullable<Awaited<ReturnType<typeof progresoCaptacion>>>; reelsAbiertos: boolean } | null = null;
  {
    const { data: cap } = await supabase.from("modelos").select("objetivo_videos, captacion_aprobada_at").eq("id", modelo.id).maybeSingle();
    if (cap?.objetivo_videos) {
      const [progreso, cuentas] = await Promise.all([
        progresoCaptacion(modelo.id as string),
        supabase.from("cuentas_instagram").select("id", { count: "exact", head: true }).eq("modelo_id", modelo.id).eq("activa", true),
      ]);
      if (progreso && (cuentas.count ?? 0) === 0) {
        captacion = { progreso, reelsAbiertos: !cap.captacion_aprobada_at };
        if (!cap.captacion_aprobada_at) {
          // Reels aun en revision: se listan todos (no solo los 12 ultimos), con su estado y el feedback del equipo
          const extra = await supabase
            .from("library_content")
            .select("id, titulo, tipo, recibido_at, estado, feedback_tipo, feedback_texto")
            .eq("modelo_id", modelo.id)
            .eq("origen", "upload_manual")
            .or("tipo.is.null,tipo.neq.5")
            .order("recibido_at", { ascending: false })
            .limit(80);
          if (!extra.error && extra.data) entregas = extra.data as Entrega[];
        }
      }
    }
  }

  // Guia para la modelo: textos de packs y posts + fotos/videos de referencia (con enlace temporal)
  const [guiasRes, refsRes] = await Promise.all([
    supabase.from("panel_config").select("key, value").in("key", [CLAVE_GUIA.pack, CLAVE_GUIA.post]),
    supabase.from("of_referencias").select("id, categoria, titulo, tipo_archivo, storage_key, bucket").order("created_at", { ascending: false }).limit(150),
  ]);
  const textoGuia = (k: string) => String((guiasRes.data ?? []).find((f) => f.key === k)?.value?.texto ?? "");
  const referencias: ReferenciaVista[] = await Promise.all(
    (refsRes.data ?? []).map(async (r) => ({
      id: r.id as string,
      categoria: r.categoria as ReferenciaVista["categoria"],
      titulo: (r.titulo as string | null) ?? null,
      tipo_archivo: r.tipo_archivo as ReferenciaVista["tipo_archivo"],
      vista: await urlVista(r.storage_key as string, (r.bucket as string | null) ?? undefined).catch(() => null),
    })),
  );
  const guia = { packs: textoGuia(CLAVE_GUIA.pack), posts: textoGuia(CLAVE_GUIA.post), referencias };
  const telegram = await estadoTelegramModelo(modelo.id as string); // avisos privados por Telegram (opcional, los activa ella)

  const onboarding = {
    datos: sanearDatos(onboardingRes.data?.datos ?? {}),
    estado: (onboardingRes.data?.estado === "enviado" ? "enviado" : "borrador") as "borrador" | "enviado",
  };

  return <PortalClient nombre={modelo.nombre} slug={slug} pendientes={pendientes} entregas={entregas} onboarding={onboarding} contenidoOF={contenidoOF} accesos={accesos} captacion={captacion} guia={guia} telegram={telegram} />;
}
