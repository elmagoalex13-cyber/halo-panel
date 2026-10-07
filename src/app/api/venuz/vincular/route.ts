import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual } from "@/lib/alcance";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vincula una creadora de Venuz con una modelo del panel (o la desvincula con modelo_id = null).
// Queda marcada como vinculo manual: el scraper no la vuelve a tocar.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  // Vincular cuentas de Venuz con modelos lo decide solo el dueño
  if (!(await alcanceActual()).dueno) return NextResponse.json({ error: "Solo el dueño del panel puede vincular cuentas de Venuz" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { cuenta_id?: string; modelo_id?: string | null } | null;
  const cuentaId = body?.cuenta_id;
  const modeloId = body?.modelo_id ?? null;
  if (!cuentaId || (modeloId !== null && !UUID.test(modeloId))) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
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
