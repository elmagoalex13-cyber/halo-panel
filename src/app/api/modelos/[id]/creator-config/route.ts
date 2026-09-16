import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const payload = { ...body, modelo_id: id, updated_at: new Date().toISOString() };

    if (!canUseSupabase()) return NextResponse.json({ data: payload });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("creator_configs")
      .upsert(payload, { onConflict: "modelo_id" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
