import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = {
      nombre: body.nombre,
      nombre_real: body.nombre_real || null,
      email: body.email || null,
      telefono: body.telefono || null,
      notas: body.notas || null,
      porcentaje_comision: body.porcentaje_comision ?? 70,
      activa: true,
      fecha_alta: new Date().toISOString().split("T")[0],
    };

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, instagram: [] } });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("modelos").insert(payload).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
