import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ["nombre", "nombre_real", "email", "telefono", "notas", "porcentaje_comision", "activa"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }

    if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("modelos").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });
    const supabase = createAdminClient();
    const { error } = await supabase.from("modelos").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
