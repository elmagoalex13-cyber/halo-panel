import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const body = await req.json() as { r2_key?: string; filename?: string; size_bytes?: number; mimetype?: string };

  try {
    const supabase = createAdminClient();

    // Verificar token
    const { data: modelo } = await supabase
      .from("modelos")
      .select("id")
      .eq("portal_token", token)
      .single();
    if (!modelo) return NextResponse.json({ error: "Token inválido" }, { status: 404 });

    // Verificar que la asignación pertenece a este modelo
    const { data: asignacion } = await supabase
      .from("asignaciones_modelo")
      .select("id, tipo, r2_key_referencia")
      .eq("id", id)
      .eq("modelo_id", modelo.id)
      .single();
    if (!asignacion) return NextResponse.json({ error: "Asignación no encontrada" }, { status: 404 });

    // Crear entry en library_content
    let contentId: string | null = null;
    if (body.r2_key) {
      const { data: content } = await supabase
        .from("library_content")
        .insert({
          modelo_id: modelo.id,
          asignacion_id: id,
          r2_key: body.r2_key,
          r2_key_referencia: asignacion.r2_key_referencia ?? null,
          filename_original: body.filename ?? null,
          size_bytes: body.size_bytes ?? null,
          mimetype: body.mimetype ?? "video/mp4",
          tipo_video: asignacion.tipo === "referencia" ? "con_referencia" : asignacion.tipo,
          estado: "en_reparto",
          recibido_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      contentId = content?.id ?? null;
    }

    // Marcar asignación como completada
    await supabase
      .from("asignaciones_modelo")
      .update({
        estado: "completado",
        library_content_id: contentId,
        completado_en: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, contentId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
