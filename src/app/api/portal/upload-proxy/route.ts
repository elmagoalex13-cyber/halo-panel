import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { sesionActual } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    forcePathStyle: true,
  });
}

export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  if (!req.body) return NextResponse.json({ error: "Archivo vacio" }, { status: 400 });

  const params = req.nextUrl.searchParams;
  const filename = params.get("filename") ?? "video.mp4";
  const contentType = params.get("contentType")?.startsWith("video/") ? params.get("contentType")! : "video/mp4";
  const ext = (filename.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
  const key = `bruto/${sesion.modeloId}/${randomUUID()}.${ext}`;
  const contentLength = Number(req.headers.get("content-length") ?? "0") || undefined;

  await r2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME ?? "halo-videos",
      Key: key,
      Body: Readable.fromWeb(req.body as unknown as Parameters<typeof Readable.fromWeb>[0]),
      ContentType: contentType,
      ContentLength: contentLength,
    }),
  );

  return NextResponse.json({ ok: true, key, contentType });
}
