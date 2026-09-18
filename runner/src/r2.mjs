import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { mkdir } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";

const s3 = new S3Client({
  region: "auto",
  endpoint: config.r2Endpoint,
  credentials: { accessKeyId: config.r2Key ?? "", secretAccessKey: config.r2Secret ?? "" },
  forcePathStyle: true,
});

/** Extrae la key de R2 desde una key o una URL publica. */
export function keyDesdeUrl(valor) {
  if (!valor) return null;
  if (!/^https?:\/\//i.test(valor)) return valor.replace(/^\/+/, "");
  const limpio = valor.replace(/^https?:\/\/https?:\/\//i, "https://");
  try {
    return decodeURIComponent(new URL(limpio).pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

export async function existeEnR2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.r2Bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function downloadFromR2(key, destPath) {
  await mkdir(path.dirname(destPath), { recursive: true });
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: key }));
  await pipeline(Body, createWriteStream(destPath));
}

export async function uploadToR2(localPath, key, contentType = "video/mp4") {
  await s3.send(
    new PutObjectCommand({ Bucket: config.r2Bucket, Key: key, Body: createReadStream(localPath), ContentType: contentType }),
  );
}

export function publicUrl(key) {
  return `${config.r2PublicUrl}/${key.replace(/^\/+/, "")}`;
}
