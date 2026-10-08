import { notFound } from "next/navigation";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { urlR2 } from "@/lib/media";
import { LoginForm } from "./LoginForm";
import { AccesosForm } from "./AccesosForm";
import { accesosCompletos } from "@/lib/accesosModelo";
import { PortalClient, type Pendiente, type Entrega } from "./PortalClient";
import { sanearDatos } from "@/lib/onboarding";
import type { ArchivoOF, ColeccionOF } from "@/lib/onlyfans";
import { urlVista } from "@/lib/r2/onlyfans";
import type { ArchivoVista } from "./OnlyFansPortal";
import { modeloEliminada } from "@/lib/papelera";

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
    .select("id, nombre, activa")
    .eq("portal_token", slug)
    .maybeSingle();
  if (!modelo || !modelo.activa || (await modeloEliminada(modelo.id as string))) notFound();

  const sesion = await sesionActual(slug);
  if (!sesion || sesion.modeloId !== modelo.id) return <LoginForm slug={slug} nombre={modelo.nombre} />;

  // Accesos de OnlyFans y Skrill: obligatorios antes de usar el portal (se guardan cifrados en el Vault de la agencia)
  if (!(await accesosCompletos(modelo.id as string))) return <AccesosForm nombre={modelo.nombre} />;

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

  const entregas = (entregasRes.data ?? []) as Entrega[];

  const onboarding = {
    datos: sanearDatos(onboardingRes.data?.datos ?? {}),
    estado: (onboardingRes.data?.estado === "enviado" ? "enviado" : "borrador") as "borrador" | "enviado",
  };

  return <PortalClient nombre={modelo.nombre} slug={slug} pendientes={pendientes} entregas={entregas} onboarding={onboarding} contenidoOF={contenidoOF} />;
}
