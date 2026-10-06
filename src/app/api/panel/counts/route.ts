import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { contarOFNuevo } from "@/lib/ofResumen";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ approval: 0, leads: 0, onlyfans: 0 });
  }

  try {
    const supabase = createAdminClient();
    const [approvalResult, leadsResult, of] = await Promise.all([
      supabase
        .from("library_content")
        .select("id", { count: "exact", head: true })
        .eq("estado", "en_aprobacion"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("estado", "nuevo"),
      contarOFNuevo(),
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
