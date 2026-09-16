import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ["username", "url", "activa", "metricool_blog_id", "metricool_estado"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }

    if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("cuentas_instagram").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
