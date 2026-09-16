import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    modelo_id: string;
    banco_id?: string;
    url_referencia_ig?: string;
    r2_key_referencia?: string;
    instrucciones?: string | null;
  };

  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("asignaciones_modelo")
      .insert({
        modelo_id: body.modelo_id,
        tipo: "referencia",
        r2_key_referencia: body.r2_key_referencia ?? null,
        url_referencia_ig: body.url_referencia_ig ?? null,
        instrucciones: body.instrucciones ?? null,
        estado: "pendiente",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
