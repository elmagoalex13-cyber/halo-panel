// Route segment config — allow large video uploads
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min timeout for large uploads

import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

// POST /api/upload — multipart form data upload to R2 + create/update library_content record
// If `content_id` is provided, updates the existing record's r2_key instead of inserting.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const modeloId = (formData.get("modelo_id") as string) ?? "";
    const cuentaId = (formData.get("cuenta_id") as string) || null;
    const tipoVideo = (formData.get("tipo_video") as string) || "sin_clasificar";
    const titulo = (formData.get("titulo") as string) || "";
    const contentId = (formData.get("content_id") as string) || null; // optional: update mode

    if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    if (!contentId && !modeloId) return NextResponse.json({ error: "modelo_id requerido" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
    const uuid = randomUUID().replace(/-/g, "").slice(0, 12);
    const r2Key = `${uuid}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await uploadToR2(r2Key, buffer, file.type || "video/mp4");

    if (!canUseSupabase()) {
      return NextResponse.json({
        ok: true,
        r2_key: r2Key,
        demo: true,
        data: { id: contentId ?? randomUUID(), modelo_id: modeloId, r2_key: r2Key, estado: "recibido" },
      });
    }

    const supabase = createAdminClient();

    if (contentId) {
      // Update mode: replace r2_key on existing record
      const { data, error } = await supabase
        .from("library_content")
        .update({
          r2_key: r2Key,
          r2_bucket: process.env.R2_BUCKET_NAME ?? "halo-videos",
          filename_original: file.name,
          mimetype: file.type || "video/mp4",
          size_bytes: buffer.byteLength,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contentId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, r2_key: r2Key, data });
    }

    // Insert mode: create new library_content record
    const { data, error } = await supabase
      .from("library_content")
      .insert({
        modelo_id: modeloId,
        cuenta_id: cuentaId,
        r2_key: r2Key,
        r2_bucket: process.env.R2_BUCKET_NAME ?? "halo-videos",
        filename_original: file.name,
        mimetype: file.type || "video/mp4",
        size_bytes: buffer.byteLength,
        titulo: titulo || file.name,
        tipo_video: tipoVideo,
        estado: "recibido",
        recibido_at: new Date().toISOString(),
        caption: "",
        frase_quemada: "",
        correcciones: "",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, r2_key: r2Key, data });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
