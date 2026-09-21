import { notFound } from "next/navigation";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { urlR2 } from "@/lib/media";
import { LoginForm } from "./LoginForm";
import { PortalClient, type Pendiente, type Entrega } from "./PortalClient";

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
        thumb: r.thumbnail_url,
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
  if (!modelo || !modelo.activa) notFound();

  const sesion = await sesionActual(slug);
  if (!sesion || sesion.modeloId !== modelo.id) return <LoginForm slug={slug} nombre={modelo.nombre} />;

  const [encargosRes, entregasRes] = await Promise.all([
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
      .order("recibido_at", { ascending: false })
      .limit(12),
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

  return <PortalClient nombre={modelo.nombre} slug={slug} pendientes={pendientes} entregas={entregas} />;
}
