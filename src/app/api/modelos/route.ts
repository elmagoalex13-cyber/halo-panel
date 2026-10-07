import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual } from "@/lib/alcance";

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
    // Toda modelo nueva nace COMPARTIDA (la meta el dueño o su socio); el dueño puede pasarla a "mis modelos" despues desde su ficha
    const alcance = await alcanceActual();
    const ambito = "compartido";
    let { data, error } = await supabase.from("modelos").insert({ ...payload, ambito }).select().single();
    if (error && /ambito/i.test(error.message)) {
      // Falta el SQL 20261013: solo el dueño puede seguir creando modelos (como antes)
      if (!alcance.dueno) return NextResponse.json({ error: "Falta ejecutar el SQL 20261013_modelos_ambito.sql en Supabase." }, { status: 409 });
      ({ data, error } = await supabase.from("modelos").insert(payload).select().single());
    }
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
