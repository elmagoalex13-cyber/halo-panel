import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    url_ig: string;
    frase?: string | null;
    cuenta_id?: string | null;
  };

  if (!body.url_ig) {
    return NextResponse.json({ error: "url_ig requerida" }, { status: 400 });
  }

  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("banco_frases_canciones")
      .insert({
        url_referencia: body.url_ig,
        frase: body.frase ?? null,
        cuenta_referencia_id: body.cuenta_id ?? null,
        origen: "manual",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
