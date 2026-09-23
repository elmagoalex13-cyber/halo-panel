import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1024 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Halo-Leads-Key",
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function isAuthorized(req: NextRequest) {
  const expected = process.env.LEADS_INGEST_KEY ?? process.env.HALO_LEADS_INGEST_KEY;
  if (!expected) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerKey = req.headers.get("x-halo-leads-key")?.trim();
  return bearer === expected || headerKey === expected;
}

function asString(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function extension(filename: string | null, contentType: string) {
  const fromName = filename?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  if (fromName) return fromName;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("video")) return "mp4";
  return "jpg";
}

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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "No autorizado" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { filename?: unknown; contentType?: unknown; size?: unknown };
    const filename = asString(body.filename, 240);
    const contentType = asString(body.contentType, 160) ?? "application/octet-stream";
    const size = Number(body.size);
    const kind = contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : null;

    if (!kind) return json({ error: "Solo se aceptan fotos y videos" }, { status: 400 });
    if (Number.isFinite(size) && size > MAX_BYTES) return json({ error: "Archivo demasiado grande" }, { status: 413 });

    const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
    const key = `leads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension(filename, contentType)}`;
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 3600 },
    );
    const publicBase = (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
    const publicUrl = publicBase ? `${publicBase}/${key}` : key;

    return json({ uploadUrl, publicUrl, key, contentType, kind });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
