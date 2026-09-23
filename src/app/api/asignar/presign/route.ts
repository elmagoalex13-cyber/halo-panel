import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024 * 1024;

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

function extension(filename: string, contentType: string) {
  const raw = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (raw && raw.length <= 8) return raw;
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "video/webm") return "webm";
  return "mp4";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      filename?: string;
      contentType?: string;
      size?: number;
    };
    const filename = String(body.filename ?? "video").trim();
    const contentType = String(body.contentType ?? "application/octet-stream").trim();
    const size = Number(body.size ?? 0);

    if (!contentType.startsWith("video/")) {
      return NextResponse.json({ error: "Solo se pueden subir videos" }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json({ error: "El video supera el limite permitido" }, { status: 413 });
    }
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      return NextResponse.json({ error: "R2 no configurado" }, { status: 503 });
    }

    const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
    const fecha = new Date().toISOString().slice(0, 10);
    const key = `referencias/manual/${fecha}/${randomUUID()}.${extension(filename, contentType)}`;
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 3600 },
    );
    const base = (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
    const publicUrl = base ? `${base}/${key}` : null;

    return NextResponse.json({ uploadUrl, publicUrl, key, contentType });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error interno" }, { status: 500 });
  }
}
