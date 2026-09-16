import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { MetricasClient } from "./MetricasClient";

export const dynamic = "force-dynamic";

export type MetricaRow = {
  id: string;
  tipo_video: string | null;
  estado: string;
  aprobado_at: string | null;
  publicado_at: string | null;
  recibido_at: string;
  modelo: { nombre: string } | null;
  cuenta: { username: string } | null;
};

async function loadData() {
  if (!canUseSupabase()) {
    return { rows: [], modelos: [] };
  }
  try {
    const supabase = createAdminClient();
    const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [rowsRes, modelosRes] = await Promise.all([
      supabase
        .from("library_content")
        .select(`id, tipo_video, estado, aprobado_at, publicado_at, recibido_at,
          modelo:modelos(nombre), cuenta:cuentas_instagram(username)`)
        .gte("recibido_at", hace90)
        .order("recibido_at", { ascending: false })
        .limit(500),
      supabase.from("modelos").select("id, nombre").eq("activa", true).order("nombre"),
    ]);
    return {
      rows: (rowsRes.data ?? []) as unknown as MetricaRow[],
      modelos: (modelosRes.data ?? []) as { id: string; nombre: string }[],
    };
  } catch {
    return { rows: [], modelos: [] };
  }
}

export default async function MetricasPage() {
  const { rows, modelos } = await loadData();
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Últimos 90 días</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-halo-text">Métricas</h1>
      </div>
      <MetricasClient rows={rows} modelos={modelos} />
    </PanelLayout>
  );
}
