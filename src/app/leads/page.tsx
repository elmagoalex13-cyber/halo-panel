import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { Lead } from "@/types";
import { LeadsClient } from "./LeadsClient";
import { CLAVE_PLANTILLAS_LEADS, PLANTILLAS_POR_DEFECTO, type PlantillasLeads } from "@/lib/leadsMensajes";

export const dynamic = "force-dynamic";

async function loadLeads(): Promise<Lead[]> {
  if (!canUseSupabase()) return [];

  try {
    const { data, error } = await createAdminClient()
      .from("leads")
      .select("*")
      .neq("estado", "eliminado")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    return (data ?? []) as Lead[];
  } catch {
    return [];
  }
}

async function loadPlantillas(): Promise<PlantillasLeads> {
  if (!canUseSupabase()) return PLANTILLAS_POR_DEFECTO;
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", CLAVE_PLANTILLAS_LEADS).maybeSingle();
    const v = (data?.value ?? {}) as Partial<PlantillasLeads>;
    return { con_fotos: v.con_fotos || PLANTILLAS_POR_DEFECTO.con_fotos, sin_fotos: v.sin_fotos || PLANTILLAS_POR_DEFECTO.sin_fotos };
  } catch {
    return PLANTILLAS_POR_DEFECTO;
  }
}

export default async function LeadsPage() {
  const [leads, plantillas] = await Promise.all([loadLeads(), loadPlantillas()]);

  return (
    <PanelLayout>
      <LeadsClient initialLeads={leads} plantillasIniciales={plantillas} />
    </PanelLayout>
  );
}
