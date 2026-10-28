import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { CreateMultipartUploadCommand, ListPartsCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sesionActual } from "@/lib/portalAuth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "portal-uploads";
const R2_PART_SIZE = 16 * 1024 * 1024;

// Devuelve las URLs firmadas para que el movil suba el video directo a R2 (por partes).
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });

  const { filename, contentType, size, resume } = (await req.json().catch(() => ({}))) as { filename?: string; contentType?: string; size?: number; resume?: { key?: string; uploadId?: string } };
  const tipo = contentType && contentType.startsWith("video/") ? contentType : "video/mp4";
  const ext = (filename?.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";

  // TODAS las subidas van a R2 (barato y sin limite de tamaño ni de descargas). Supabase Storage solo queda como último recurso
  // si R2 no estuviera configurado o no se supiera el tamaño del archivo.
  const r2Listo = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
  if (r2Listo && size && size > 0) {
    const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
    const client = r2Client();
    const partCount = Math.ceil(size / R2_PART_SIZE);
    const firmar = (key: string, uploadId: string, numeros: number[]) =>
      Promise.all(
        numeros.map(async (partNumber) => ({
          partNumber,
          url: await getSignedUrl(client, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 }),
        })),
      );

    // REANUDAR: si la subida se corto, se vuelve a pedir el permiso de esa misma subida y solo se envian las partes que faltan
    if (resume?.key && resume.uploadId) {
      if (!resume.key.startsWith(`bruto/${sesion.modeloId}/`) || resume.key.includes("..")) return NextResponse.json({ error: "Subida no valida" }, { status: 400 });
      try {
        const hechas: Array<{ partNumber: number; etag: string }> = [];
        let marcador: string | undefined;
        do {
          const r = await client.send(new ListPartsCommand({ Bucket: bucket, Key: resume.key, UploadId: resume.uploadId, PartNumberMarker: marcador }));
          for (const parte of r.Parts ?? []) if (parte.PartNumber && parte.ETag) hechas.push({ partNumber: parte.PartNumber, etag: parte.ETag });
          marcador = r.IsTruncated ? String(r.NextPartNumberMarker ?? "") : undefined;
        } while (marcador);
        const ya = new Set(hechas.map((h) => h.partNumber));
        const faltan = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !ya.has(n));
        return NextResponse.json({ provider: "r2-multipart", key: resume.key, uploadId: resume.uploadId, partSize: R2_PART_SIZE, parts: await firmar(resume.key, resume.uploadId, faltan), hechas: hechas.filter((h) => h.partNumber <= partCount), contentType: tipo });
      } catch {
        return NextResponse.json({ error: "reanudar-no" }, { status: 409 }); // esa subida ya no existe: el movil empieza una nueva
      }
    }

    const key = `bruto/${sesion.modeloId}/${randomUUID()}.${ext}`;
    const multipart = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: tipo }));
    if (!multipart.UploadId) return NextResponse.json({ error: "No se pudo preparar la subida" }, { status: 500 });
    const parts = await firmar(key, multipart.UploadId, Array.from({ length: partCount }, (_, i) => i + 1));

    return NextResponse.json({
      provider: "r2-multipart",
      key,
      uploadId: multipart.UploadId,
      partSize: R2_PART_SIZE,
      parts,
      hechas: [],
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
