import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, exigirModelo, modeloDeFila, veModelo } from "@/lib/alcance";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vincula una creadora de Venuz con una modelo del panel (o la desvincula con modelo_id = null).
// Queda marcada como vinculo manual: el scraper no la vuelve a tocar.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { cuenta_id?: string; modelo_id?: string | null } | null;
  const cuentaId = body?.cuenta_id;
  const modeloId = body?.modelo_id ?? null;
  if (!cuentaId || (modeloId !== null && !UUID.test(modeloId))) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  // El dueño vincula lo que quiera. Su socio, solo cuentas sin vincular (o ya de una modelo compartida) y solo a modelos compartidas
  const alcance = await alcanceActual();
  if (!alcance.dueno) {
    const actual = await modeloDeFila("venuz_cuentas", cuentaId);
    if (actual && !veModelo(alcance, actual)) return NextResponse.json({ error: "No tienes acceso a esta cuenta" }, { status: 403 });
    if (modeloId) {
      const g = await exigirModelo(modeloId, alcance);
      if (g) return g;
    }
  }
  const supabase = createAdminClient();
  if (modeloId) {
    // Una modelo solo puede estar vinculada a una cuenta de Venuz.
    const { data: otra } = await supabase.from("venuz_cuentas").select("id, nombre").eq("modelo_id", modeloId).neq("id", cuentaId).limit(1);
    if (otra?.length) {
      return NextResponse.json({ error: `Esa modelo ya esta vinculada a ${otra[0].nombre}` }, { status: 409 });
    }
  }
  const { error } = await supabase
    .from("venuz_cuentas")
    .update({ modelo_id: modeloId, vinculo_manual: true, updated_at: new Date().toISOString() })
    .eq("id", cuentaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
