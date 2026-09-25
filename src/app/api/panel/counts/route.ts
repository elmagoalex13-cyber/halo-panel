import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ approval: 0, leads: 0 });
  }

  try {
    const supabase = createAdminClient();
    const [approvalResult, leadsResult] = await Promise.all([
      supabase
        .from("library_content")
        .select("id", { count: "exact", head: true })
        .eq("estado", "en_aprobacion"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("estado", "nuevo"),
    ]);

    return NextResponse.json({
      approval: approvalResult.count ?? 0,
      leads: leadsResult.count ?? 0,
    });
  } catch {
    return NextResponse.json({ approval: 0, leads: 0 });
  }
}
