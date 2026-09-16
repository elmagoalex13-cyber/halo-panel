import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  try {
    const { key, contentType } = await req.json() as { key: string; contentType: string };
    if (!key || !contentType) return NextResponse.json({ error: "key y contentType requeridos" }, { status: 400 });

    const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
    const url = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 3600 }
    );
    const publicUrl = `${(process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}`;
    return NextResponse.json({ url, publicUrl, key });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
