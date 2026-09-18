import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// "etiquetado" es un concepto de UI: en la BD son piezas en estado "clasificando" con tipo asignado.
const ESTADO_DB: Record<string, string> = { etiquetado: "clasificando" };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { tipo_video?: string; estado?: string; cuenta_destino_id?: string | null };

  if (!canUseSupabase()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.tipo_video) {
      update.tipo_video = body.tipo_video;
      update.clasificado_at = new Date().toISOString();
    }
    if (body.estado) {
      update.estado = ESTADO_DB[body.estado] ?? body.estado;
      if (update.estado === "en_reparto") update.reparto_at = new Date().toISOString();
    }
    if (body.cuenta_destino_id !== undefined) update.cuenta_id = body.cuenta_destino_id;

    const { data, error } = await supabase
      .from("library_content")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
