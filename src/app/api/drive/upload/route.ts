import { NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/drive";
import { getSignedDownloadUrl } from "@/lib/r2";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

type DriveVideoRow = {
  id: string;
  r2_key: string;
  r2_bucket: string;
  tipo_video: string;
  filename_original?: string | null;
  mimetype?: string | null;
  modelos?: { nombre?: string | null } | null;
};

export async function POST(request: Request) {
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("library_content").select("*, modelos(nombre)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Video not found" }, { status: 404 });

  try {
    const video = data as DriveVideoRow;
    const signedUrl = await getSignedDownloadUrl(video.r2_key, video.r2_bucket);
    const response = await fetch(signedUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const driveUrl = await uploadToDrive({
      nombreModelo: video.modelos?.nombre ?? "Sin modelo",
      tipoVideo: video.tipo_video,
      filename: video.filename_original ?? `${video.id}.mp4`,
      buffer,
      mimeType: video.mimetype ?? "video/mp4",
    });

    await supabase.from("library_content").update({ drive_url: driveUrl, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, drive_url: driveUrl });
  } catch (uploadError) {
    return NextResponse.json({ error: uploadError instanceof Error ? uploadError.message : "Drive upload failed" }, { status: 500 });
  }
}
