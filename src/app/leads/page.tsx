import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { Lead } from "@/types";
import { LeadsClient } from "./LeadsClient";

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

export default async function LeadsPage() {
  const leads = await loadLeads();

  return (
    <PanelLayout>
      <LeadsClient initialLeads={leads} />
    </PanelLayout>
  );
}
