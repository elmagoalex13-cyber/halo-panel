import { NextResponse } from "next/server";
import { FILTRO_ETIQUETADO } from "@/lib/tipoVideo";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Reparto automatico: piezas etiquetadas (estado "clasificando" con tipo asignado) sin cuenta
// pasan a "en_reparto" con la cuenta principal (o la primera activa) de su modelo.
export async function POST() {
  if (!canUseSupabase()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();

    const { data: pendientes, error: pErr } = await supabase
      .from("library_content")
      .select("id, modelo_id, cuenta_id, tipo_video")
      .eq("estado", "clasificando")
      .or(FILTRO_ETIQUETADO)
      .limit(200);

    if (pErr) throw pErr;
    if (!pendientes?.length) return NextResponse.json({ ok: true, asignados: 0 });

    const { data: cuentas, error: cErr } = await supabase
      .from("cuentas_instagram")
      .select("id, modelo_id, tipo")
      .eq("activa", true);

    if (cErr) throw cErr;

    const cuentasByModelo: Record<string, string> = {};
    for (const cuenta of cuentas ?? []) {
      if (cuenta.tipo === "principal" || !cuentasByModelo[cuenta.modelo_id]) {
        cuentasByModelo[cuenta.modelo_id] = cuenta.id;
      }
    }

    let asignados = 0;
    for (const pieza of pendientes) {
      const cuentaId = pieza.cuenta_id ?? (pieza.modelo_id ? cuentasByModelo[pieza.modelo_id] : null);
      const { error } = await supabase
        .from("library_content")
        .update({
          estado: "en_reparto",
          cuenta_id: cuentaId ?? null,
          reparto_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pieza.id);
      if (!error) asignados++;
    }

    return NextResponse.json({ ok: true, asignados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
