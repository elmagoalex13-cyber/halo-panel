import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...body } });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("facturacion_modelos")
      .insert({
        modelo_id: body.modelo_id,
        modelo_nombre: body.modelo_nombre,
        periodo_inicio: body.periodo_inicio,
        periodo_fin: body.periodo_fin,
        ingresos_brutos: body.ingresos_brutos,
        porcentaje_comision: body.porcentaje_comision ?? 30,
        comision_agencia: Number(body.ingresos_brutos) * (Number(body.porcentaje_comision ?? 30) / 100),
        neto_modelo: Number(body.ingresos_brutos) * (1 - Number(body.porcentaje_comision ?? 30) / 100),
        estado_cobro: body.estado_cobro ?? "pendiente",
        notas: body.notas || null,
        fuente: "manual",
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
