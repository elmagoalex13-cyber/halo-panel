import { NextRequest, NextResponse } from "next/server";
import { CompleteMultipartUploadCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sesionActual } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

type UploadedPart = { partNumber: number; etag: string };

export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; uploadId?: string; parts?: UploadedPart[] };
  if (!body.key?.startsWith(`bruto/${sesion.modeloId}/`) || !body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
    return NextResponse.json({ error: "Subida no valida" }, { status: 400 });
  }

  const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
  try {
    await r2Client().send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: body.key,
        UploadId: body.uploadId,
        MultipartUpload: {
          Parts: body.parts
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag }))
            .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0)),
        },
      }),
    );
  } catch (e) {
    // Si el movil repitio este aviso porque no le llego la respuesta, la subida ya estaba terminada: se comprueba y se da por buena
    const existe = await r2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: body.key })).then(() => true, () => false);
    if (!existe) return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo finalizar la subida" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
