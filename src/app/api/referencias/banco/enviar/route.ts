import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Envia una referencia a una modelo creando un encargo (tabla `encargos`).
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    modelo_id?: string;
    banco_id?: string;
    url_referencia_ig?: string | null;
    instrucciones?: string | null;
    tipo_video?: string | null;
  };

  if (!body.modelo_id) {
    return NextResponse.json({ error: "modelo_id requerido" }, { status: 400 });
  }
  if (!canUseSupabase()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("encargos")
      .insert({
        modelo_id: body.modelo_id,
        referencia_id: body.banco_id ?? null,
        tipo_video: body.tipo_video ?? "tipo4",
        pagina_url: body.url_referencia_ig ?? null,
        instrucciones: body.instrucciones ?? null,
        estado: "pendiente",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
