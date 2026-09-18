import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ["formato_confirmado", "estado_triaje", "confirmado_at"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }

    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    let { data, error } = await supabase.from("referencias_videos").update(payload).eq("id", id).select().single();

    // Si la columna confirmado_at aun no existe en la BD, se guarda el resto.
    if (error && "confirmado_at" in payload && /confirmado_at/.test(error.message)) {
      const { confirmado_at: _omit, ...resto } = payload;
      void _omit;
      ({ data, error } = await supabase.from("referencias_videos").update(resto).eq("id", id).select().single());
    }

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
