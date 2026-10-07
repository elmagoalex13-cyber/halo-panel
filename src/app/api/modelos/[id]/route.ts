import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, modeloProhibido, veModelo } from "@/lib/alcance";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const alcance = await alcanceActual();
    if (!veModelo(alcance, id)) return modeloProhibido();
    const body = await req.json();
    const allowed = ["nombre", "nombre_real", "email", "telefono", "notas", "porcentaje_comision", "activa"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }

    // Solo el dueño decide que modelos comparte con su socio
    if (alcance.dueno && (body.ambito === "privado" || body.ambito === "compartido")) payload.ambito = body.ambito;

    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

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
    if (!veModelo(await alcanceActual(), id)) return modeloProhibido();
    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
    const supabase = createAdminClient();
    const { error } = await supabase.from("modelos").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
