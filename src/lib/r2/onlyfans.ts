// Almacen de los archivos de OnlyFans. Todo directo y sin tocar: el navegador sube el archivo tal cual a R2 con URLs
// firmadas (nunca pasa por el servidor, que limita el tamano) y se descarga igual, con un enlace firmado temporal.
// Por defecto usa el mismo bucket que el resto; si mas adelante creas un bucket PRIVADO solo para esto, basta con
// definir R2_BUCKET_ONLYFANS (y darle el mismo CORS) para moverlo sin tocar codigo.
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const bucketOF = () => process.env.R2_BUCKET_ONLYFANS ?? process.env.R2_BUCKET_NAME ?? "halo-videos";

function cliente() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error("Faltan las credenciales de Cloudflare R2");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

const UMBRAL_MULTIPART = 64 * 1024 * 1024; // por encima se sube por partes (mas fiable desde el movil)
const TAM_PARTE = 16 * 1024 * 1024;

export type SubidaPreparada =
  | { modo: "single"; url: string; contentType: string }
  | { modo: "multipart"; uploadId: string; partSize: number; parts: Array<{ partNumber: number; url: string }>; contentType: string };

export async function prepararSubida(key: string, contentType: string, size: number): Promise<SubidaPreparada> {
  const c = cliente();
  const Bucket = bucketOF();
  if (size <= UMBRAL_MULTIPART) {
    const url = await getSignedUrl(c, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: 6 * 3600 });
    return { modo: "single", url, contentType };
  }
  const mp = await c.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  if (!mp.UploadId) throw new Error("No se pudo preparar la subida");
  const total = Math.ceil(size / TAM_PARTE);
  const parts = await Promise.all(
    Array.from({ length: total }, async (_, i) => ({
      partNumber: i + 1,
      url: await getSignedUrl(c, new UploadPartCommand({ Bucket, Key: key, UploadId: mp.UploadId, PartNumber: i + 1 }), { expiresIn: 6 * 3600 }),
    })),
  );
  return { modo: "multipart", uploadId: mp.UploadId, partSize: TAM_PARTE, parts, contentType };
}

export async function completarMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
  await cliente().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketOF(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }),
  );
}

export async function abortarMultipart(key: string, uploadId: string) {
  await cliente().send(new AbortMultipartUploadCommand({ Bucket: bucketOF(), Key: key, UploadId: uploadId })).catch(() => undefined);
}

/** Tamano real del objeto subido, o null si no existe. */
export async function tamanoEnR2(key: string): Promise<number | null> {
  try {
    const r = await cliente().send(new HeadObjectCommand({ Bucket: bucketOF(), Key: key }));
    return r.ContentLength ?? 0;
  } catch {
    return null;
  }
}

export async function borrarObjetoOF(key: string, bucket = bucketOF()) {
  await cliente().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Enlace temporal para DESCARGAR el archivo exacto con el nombre indicado. */
export async function urlDescarga(key: string, nombre: string, bucket = bucketOF()) {
  return getSignedUrl(
    cliente(),
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename="${nombre.replace(/"/g, "")}"` }),
    { expiresIn: 3600 },
  );
}

/** Enlace temporal para VER el archivo en el navegador (miniaturas, reproductor). */
export async function urlVista(key: string, bucket = bucketOF()) {
  return getSignedUrl(cliente(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}
