import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { mkdir } from "fs/promises";
import path from "path";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;

/**
 * Descarga un objeto de R2 a un archivo local.
 * @param {string} key - Clave en R2 (ej: "bruto/uuid.mp4")
 * @param {string} destPath - Ruta local donde guardar el archivo
 */
export async function downloadFromR2(key, destPath) {
  await mkdir(path.dirname(destPath), { recursive: true });
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const { Body } = await s3.send(cmd);
  await pipeline(Body, createWriteStream(destPath));
}

/**
 * Sube un archivo local a R2.
 * @param {string} localPath - Ruta local del archivo
 * @param {string} key - Clave destino en R2
 * @param {string} contentType - MIME type del archivo
 */
export async function uploadToR2(localPath, key, contentType = "video/mp4") {
  const body = createReadStream(localPath);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3.send(cmd);
}

/**
 * Borra un objeto de R2.
 * @param {string} key
 */
export async function deleteFromR2(key) {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3.send(cmd);
}

/**
 * Devuelve la URL pública de un objeto en R2.
 * @param {string} key
 */
export function publicUrl(key) {
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  return `${base}/${key.replace(/^\//, "")}`;
}
