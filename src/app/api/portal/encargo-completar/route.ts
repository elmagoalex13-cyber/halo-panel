import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { encargo_id?: string };
  if (!body.encargo_id) return NextResponse.json({ error: "Falta encargo_id" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: encargo } = await supabase
    .from("encargos")
    .select("id, modelo_id, tipo_video, estado")
    .eq("id", body.encargo_id)
    .maybeSingle();

  if (!encargo || encargo.modelo_id !== sesion.modeloId) {
    return NextResponse.json({ error: "Video pendiente no encontrado" }, { status: 404 });
  }
  if (encargo.estado === "entregado") return NextResponse.json({ ok: true });

  const tipo = Number(String(encargo.tipo_video ?? "").match(/[1-4]/)?.[0] ?? 0);
  if (tipo === 4) return NextResponse.json({ error: "Este video debe subirse desde la referencia" }, { status: 400 });

  const { error } = await supabase
    .from("encargos")
    .update({ estado: "entregado", updated_at: new Date().toISOString() })
    .eq("id", body.encargo_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
