import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { sesionActual } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// Devuelve una URL firmada para que el movil suba el video directo a R2 (sin pasar por el servidor).
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });

  const { filename, contentType } = (await req.json().catch(() => ({}))) as { filename?: string; contentType?: string };
  const tipo = contentType && contentType.startsWith("video/") ? contentType : "video/mp4";
  const ext = (filename?.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
  const key = `bruto/${sesion.modeloId}/${randomUUID()}.${ext}`;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    forcePathStyle: true,
  });
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME ?? "halo-videos", Key: key, ContentType: tipo }),
    { expiresIn: 3600 },
  );
  return NextResponse.json({ url, key, contentType: tipo });
}
