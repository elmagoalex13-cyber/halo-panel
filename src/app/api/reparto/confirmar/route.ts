import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/reparto/confirmar
// Mueve vídeos de en_reparto → editando para que el runner los procese
// Body: { ids?: string[] }  — si no se pasan ids, confirma todos los en_reparto con tipo_video asignado
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, confirmados: 0, demo: true });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = body.ids;

    const supabase = createAdminClient();

    let query = supabase
      .from("library_content")
      .update({
        estado: "editando",
        updated_at: new Date().toISOString(),
      })
      .eq("estado", "en_reparto")
      .not("tipo_video", "is", null)
      .neq("tipo_video", "sin_clasificar");

    if (ids?.length) {
      query = query.in("id", ids);
    }

    const { data, error } = await query.select("id");

    if (error) throw error;
    return NextResponse.json({ ok: true, confirmados: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
