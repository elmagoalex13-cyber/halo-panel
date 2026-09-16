import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { CalendarioClient } from "./CalendarioClient";

export const dynamic = "force-dynamic";

export type PublicacionRow = {
  id: string;
  estado: string;
  tipo_video: string | null;
  aprobado_at: string | null;
  publicado_at: string | null;
  url_publicado: string | null;
  modelo: { nombre: string } | null;
  cuenta: { username: string } | null;
};

async function loadData() {
  if (!canUseSupabase()) {
    return { publicaciones: [], cuentas: [] };
  }
  try {
    const supabase = createAdminClient();
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const en30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const [pubRes, cuentasRes] = await Promise.all([
      supabase
        .from("library_content")
        .select(`id, estado, tipo_video, aprobado_at, publicado_at, url_publicado,
          modelo:modelos(nombre), cuenta:cuentas_instagram(username)`)
        .in("estado", ["aprobado", "publicado"])
        .or(`publicado_at.gte.${hace30},aprobado_at.gte.${hace30}`)
        .order("publicado_at", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase.from("cuentas_instagram").select("id, username, modelo_id").eq("activa", true).order("username"),
    ]);

    return {
      publicaciones: (pubRes.data ?? []) as unknown as PublicacionRow[],
      cuentas: (cuentasRes.data ?? []) as { id: string; username: string; modelo_id: string }[],
    };
  } catch {
    return { publicaciones: [], cuentas: [] };
  }
}

export default async function CalendarioPage() {
  const { publicaciones, cuentas } = await loadData();
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Seguimiento de publicaciones por cuenta</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-halo-text">Calendario</h1>
      </div>
      <CalendarioClient publicaciones={publicaciones} cuentas={cuentas} />
    </PanelLayout>
  );
}
