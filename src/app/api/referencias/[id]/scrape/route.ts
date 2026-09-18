import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// Pide al runner que analice la cuenta en su proximo ciclo (menos de 1 minuto):
// el scraper del VPS analiza las cuentas activas sin analisis previo (ultimo_scrape_at nulo).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    const { error } = await supabase.from("referencias_cuentas").update({ ultimo_scrape_at: null }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, en_cola: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
