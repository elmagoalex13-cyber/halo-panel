import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { CreateMultipartUploadCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sesionActual } from "@/lib/portalAuth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "portal-uploads";
const SUPABASE_MAX_BYTES = 50 * 1024 * 1024;
const R2_PART_SIZE = 16 * 1024 * 1024;

// Devuelve una URL firmada para que el movil suba el video directo a Supabase Storage.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });

  const { filename, contentType, size } = (await req.json().catch(() => ({}))) as { filename?: string; contentType?: string; size?: number };
  const tipo = contentType && contentType.startsWith("video/") ? contentType : "video/mp4";
  const ext = (filename?.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";

  if (size && size > SUPABASE_MAX_BYTES) {
    const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
    const key = `bruto/${sesion.modeloId}/${randomUUID()}.${ext}`;
    const client = r2Client();
    const multipart = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: tipo }));
    if (!multipart.UploadId) return NextResponse.json({ error: "No se pudo preparar la subida" }, { status: 500 });
    const partCount = Math.ceil(size / R2_PART_SIZE);
    const parts = await Promise.all(
      Array.from({ length: partCount }, async (_, index) => {
        const partNumber = index + 1;
        const url = await getSignedUrl(
          client,
          new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: multipart.UploadId, PartNumber: partNumber }),
          { expiresIn: 3600 },
        );
        return { partNumber, url };
      }),
    );

    return NextResponse.json({
      provider: "r2-multipart",
      key,
      uploadId: multipart.UploadId,
      partSize: R2_PART_SIZE,
      parts,
      contentType: tipo,
    });
  }

  const path = `${sesion.modeloId}/${randomUUID()}.${ext}`;

  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "No se pudo preparar la subida" }, { status: 500 });

  return NextResponse.json({
    provider: "supabase",
    bucket: BUCKET,
    path,
    token: data.token,
    uploadEndpoint: storageUploadEndpoint(),
    key: `supabase://${BUCKET}/${path}`,
    contentType: tipo,
  });
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

function storageUploadEndpoint() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const { hostname, protocol } = new URL(supabaseUrl);
  const projectId = hostname.split(".")[0];
  return `${protocol}//${projectId}.storage.supabase.co/storage/v1/upload/resumable/sign`;
}
