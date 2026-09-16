import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { tipo_video?: string; estado?: string };

  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  try {
    const supabase = createAdminClient();
    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (body.tipo_video) update.tipo_video = body.tipo_video;
    if (body.estado) update.estado = body.estado;

    const { data, error } = await supabase
      .from("library_content")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
