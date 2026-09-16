import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { RepartoClient } from "./RepartoClient";
import { sampleModelos, sampleCuentasInstagram } from "@/lib/data";

export const dynamic = "force-dynamic";

async function loadData() {
  if (!canUseSupabase()) {
    return { asignaciones: [], modelos: sampleModelos, cuentas: sampleCuentasInstagram, pendientes: 0 };
  }
  try {
    const supabase = createAdminClient();
    const [aRes, mRes, cRes, pRes] = await Promise.all([
      supabase
        .from("library_content")
        .select(`id, titulo, tipo_video, estado, recibido_at, r2_key, filename_original,
          asignada_at, modelo:modelos(nombre), cuenta:cuentas_instagram(username)`)
        .in("estado", ["en_reparto", "editando", "en_aprobacion", "aprobado"])
        .order("asignada_at", { ascending: false })
        .limit(80),
      supabase.from("modelos").select("id, nombre").eq("activa", true).order("nombre"),
      supabase.from("cuentas_instagram").select("id, username, modelo_id, activa").order("username"),
      supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "etiquetado"),
    ]);
    return {
      asignaciones: (aRes.data ?? []) as unknown as RepartoRow[],
      modelos: (mRes.data ?? []) as { id: string; nombre: string }[],
      cuentas: (cRes.data ?? []) as { id: string; username: string; modelo_id: string; activa: boolean }[],
      pendientes: pRes.count ?? 0,
    };
  } catch {
    return { asignaciones: [], modelos: [], cuentas: [], pendientes: 0 };
  }
}

export type RepartoRow = {
  id: string;
  titulo: string | null;
  tipo_video: string | null;
  estado: string;
  recibido_at: string;
  asignada_at: string | null;
  r2_key: string | null;
  filename_original: string | null;
  modelo: { nombre: string } | null;
  cuenta: { username: string } | null;
};

export default async function RepartoPage() {
  const { asignaciones, modelos, cuentas, pendientes } = await loadData();
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Asignación de material a cuentas</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-halo-text">Reparto</h1>
      </div>
      <RepartoClient asignaciones={asignaciones} modelos={modelos} cuentas={cuentas} pendientes={pendientes} />
    </PanelLayout>
  );
}
