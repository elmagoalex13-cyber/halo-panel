import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Anade una referencia viral manual al banco (tabla `referencias`).
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url_ig?: string; frase?: string | null };

  if (!body.url_ig) {
    return NextResponse.json({ error: "url_ig requerida" }, { status: 400 });
  }
  if (!canUseSupabase()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("referencias")
      .insert({ url_original: body.url_ig, descripcion: body.frase ?? null })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
