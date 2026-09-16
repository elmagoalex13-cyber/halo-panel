import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json() as { videos: { r2_key: string; filename: string; size_bytes: number; tipo: string }[] };

  try {
    const supabase = createAdminClient();

    const { data: modelo } = await supabase
      .from("modelos")
      .select("id")
      .eq("portal_token", token)
      .single();
    if (!modelo) return NextResponse.json({ error: "Token inválido" }, { status: 404 });

    const rows = (body.videos ?? []).map((v) => ({
      modelo_id: modelo.id,
      r2_key: v.r2_key,
      filename_original: v.filename,
      size_bytes: v.size_bytes,
      mimetype: "video/mp4",
      tipo_video: v.tipo ?? "sin_clasificar",
      estado: "en_reparto",
      recibido_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase.from("library_content").insert(rows).select("id");
    if (error) throw error;

    return NextResponse.json({ ok: true, insertados: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
