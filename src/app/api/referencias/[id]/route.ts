import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { tipoAutomatico } from "@/lib/viralesExtension";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ["categoria", "notas", "intervalo_dias", "activa", "favorita"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }

    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("referencias_cuentas").update(payload).eq("id", id).select().single();
    if (error) throw error;
    // Al marcar la cuenta como hablado / frases, sus videos que aun no tienen tipo de edicion lo reciben solos (sin ir marcandolos uno a uno)
    const tipo = "categoria" in payload ? tipoAutomatico(payload.categoria as string | null) : null;
    if (tipo) {
      await supabase.from("referencias_videos").update({ formato_propuesto: tipo, formato_confirmado: tipo }).eq("cuenta_id", id).eq("estado_triaje", "pendiente").is("formato_confirmado", null);
    }
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    const { error } = await supabase.from("referencias_cuentas").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
