import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/aprobacion/publicado  { ids: string[], publicado: boolean }
//  publicado:true  -> aprobado => publicado (los que subiste tu a mano). Si no tenian fecha, se pone ahora.
//  publicado:false -> deshacer: publicado => aprobado (y se limpia la fecha para que no vuelva a
//                     marcarse solo como publicado al instante).
// Protegida por el middleware del panel (solo admin).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ids?: unknown; publicado?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? Array.from(new Set(body!.ids.map(String))) : [];
  if (!ids.length || ids.length > 200 || !ids.every((id) => UUID.test(id)) || typeof body?.publicado !== "boolean") {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const supabase = createAdminClient();
  const ahora = new Date().toISOString();
  const marcar = body.publicado;
  const alcance = await alcanceActual();

  const { data, error } = await soloVisibles(
    supabase
      .from("library_content")
      .update({ estado: marcar ? "publicado" : "aprobado", updated_at: ahora, ...(marcar ? {} : { publicado_at: null }) })
      .in("id", ids)
      .eq("estado", marcar ? "aprobado" : "publicado")
      .select("id"),
    alcance,
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hechos = (data ?? []).map((r) => r.id as string);
  if (marcar && hechos.length) {
    const { error: errFecha } = await supabase.from("library_content").update({ publicado_at: ahora }).in("id", hechos).is("publicado_at", null);
    if (errFecha) return NextResponse.json({ error: errFecha.message }, { status: 500 });
  }

  await supabase
    .from("log_agentes")
    .insert({
      agente: "runner_edicion",
      accion: marcar ? "mesa_marcar_publicado" : "mesa_deshacer_publicado",
      resultado: "ok",
      detalle: { content_ids: hechos },
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ ok: true, cambiados: hechos, ignorados: ids.length - hechos.length });
}
