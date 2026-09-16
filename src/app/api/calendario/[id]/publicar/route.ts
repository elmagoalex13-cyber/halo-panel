import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { url_publicado?: string; publicado_at?: string };

  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("library_content")
      .update({
        url_publicado: body.url_publicado ?? null,
        publicado_at: body.publicado_at ?? new Date().toISOString(),
        estado: "publicado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
