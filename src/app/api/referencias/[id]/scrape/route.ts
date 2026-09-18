import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// Trigger manual del scraper de referencias. Hoy solo marca el timestamp;
// aqui se conectara el actor de Apify (o script propio) cuando este disponible.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const now = new Date().toISOString();

    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    const { error } = await supabase.from("referencias_cuentas").update({ ultimo_scrape_at: now }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, ultimo_scrape_at: now });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
