import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { contarOFNuevo } from "@/lib/ofResumen";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ approval: 0, leads: 0, onlyfans: 0 });
  }

  try {
    const supabase = createAdminClient();
    const sesion = await sesionPanelActual();
    const puedeLeads = !sesion?.denegadas.includes("leads");
    const puedeOF = !sesion?.denegadas.includes("onlyfans");
    const [approvalResult, leadsResult, of] = await Promise.all([
      supabase
        .from("library_content")
        .select("id", { count: "exact", head: true })
        .eq("estado", "en_aprobacion"),
      puedeLeads
        ? supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "nuevo")
        : Promise.resolve({ count: 0 }),
      puedeOF ? contarOFNuevo() : Promise.resolve({ count: 0, modelos: [] as string[] }),
    ]);

    return NextResponse.json({
      approval: approvalResult.count ?? 0,
      leads: leadsResult.count ?? 0,
      onlyfans: of.count,
    });
  } catch {
    return NextResponse.json({ approval: 0, leads: 0, onlyfans: 0 });
  }
}
