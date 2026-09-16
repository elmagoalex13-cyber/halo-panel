import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = {
      username: String(body.username || "").replace(/^@/, ""),
      categoria: body.categoria || null,
      notas: body.notas || null,
      intervalo_dias: body.intervalo_dias ?? 7,
      activa: true,
    };
    if (!payload.username) return NextResponse.json({ error: "Falta username" }, { status: 400 });

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, ultimo_scrape_at: null, created_at: new Date().toISOString() } });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("referencias_cuentas").insert(payload).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
