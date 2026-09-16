import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const payload = {
      modelo_id: id,
      username: String(body.username || "").replace(/^@/, ""),
      url: body.url || null,
      activa: body.activa ?? true,
    };
    if (!payload.username) return NextResponse.json({ error: "Falta username" }, { status: 400 });

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload } });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("cuentas_instagram").insert(payload).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
