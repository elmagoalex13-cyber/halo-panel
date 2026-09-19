import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sesionActual } from "@/lib/portalAuth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "portal-uploads";

// Devuelve una URL firmada para que el movil suba el video directo a Supabase Storage.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });

  const { filename, contentType } = (await req.json().catch(() => ({}))) as { filename?: string; contentType?: string };
  const tipo = contentType && contentType.startsWith("video/") ? contentType : "video/mp4";
  const ext = (filename?.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
  const path = `${sesion.modeloId}/${randomUUID()}.${ext}`;

  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "No se pudo preparar la subida" }, { status: 500 });

  return NextResponse.json({
    provider: "supabase",
    bucket: BUCKET,
    path,
    token: data.token,
    key: `supabase://${BUCKET}/${path}`,
    contentType: tipo,
  });
}
