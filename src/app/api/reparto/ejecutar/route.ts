import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, asignados: 0, demo: true });
  }

  try {
    const supabase = createAdminClient();

    // Traer todos los etiquetados sin cuenta asignada
    const { data: pendientes, error: pErr } = await supabase
      .from("library_content")
      .select("id, modelo_id, tipo_video")
      .eq("estado", "etiquetado")
      .is("cuenta_destino_id", null)
      .limit(50);

    if (pErr) throw pErr;
    if (!pendientes?.length) return NextResponse.json({ ok: true, asignados: 0 });

    // Traer cuentas activas con sus modelos
    const { data: cuentas, error: cErr } = await supabase
      .from("cuentas_instagram")
      .select("id, modelo_id, es_principal")
      .eq("activa", true);

    if (cErr) throw cErr;

    const cuentasByModelo: Record<string, string> = {};
    for (const cuenta of (cuentas ?? [])) {
      if (cuenta.es_principal) {
        cuentasByModelo[cuenta.modelo_id] = cuenta.id;
      } else if (!cuentasByModelo[cuenta.modelo_id]) {
        cuentasByModelo[cuenta.modelo_id] = cuenta.id;
      }
    }

    let asignados = 0;
    for (const pieza of pendientes) {
      const cuentaId = pieza.modelo_id ? cuentasByModelo[pieza.modelo_id] : null;
      const { error } = await supabase
        .from("library_content")
        .update({
          estado: "en_reparto",
          cuenta_destino_id: cuentaId ?? null,
          asignada_at: new Date().toISOString(),
        })
        .eq("id", pieza.id);
      if (!error) asignados++;
    }

    return NextResponse.json({ ok: true, asignados });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
