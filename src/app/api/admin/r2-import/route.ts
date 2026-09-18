// GET /api/admin/r2-import — lists R2 objects not yet in library_content and returns them
// POST /api/admin/r2-import — imports listed R2 objects into library_content (without modelo, estado=recibido)
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

function createR2Client() {
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

async function listAllR2Keys(): Promise<string[]> {
  const client = createR2Client();
  const bucket = process.env.R2_BUCKET_NAME ?? "halo-videos";
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });
    const res = await client.send(cmd);
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "No Supabase" }, { status: 503 });

  const [allKeys, supabase] = [await listAllR2Keys(), createAdminClient()];
  const { data: existing } = await supabase.from("library_content").select("r2_key");
  const existingKeys = new Set((existing ?? []).map((row: { r2_key: string | null }) => row.r2_key).filter(Boolean));

  const missing = allKeys.filter((key) => !existingKeys.has(key));
  return NextResponse.json({ total_r2: allKeys.length, already_imported: existingKeys.size, missing_count: missing.length, missing_keys: missing });
}

export async function POST() {
  if (!canUseSupabase()) return NextResponse.json({ error: "No Supabase" }, { status: 503 });

  const [allKeys, supabase] = [await listAllR2Keys(), createAdminClient()];
  const { data: existing } = await supabase.from("library_content").select("r2_key");
  const existingKeys = new Set((existing ?? []).map((row: { r2_key: string | null }) => row.r2_key).filter(Boolean));

  const missing = allKeys.filter((key) => !existingKeys.has(key));
  if (missing.length === 0) return NextResponse.json({ ok: true, imported: 0, message: "Nada nuevo que importar" });

  const rows = missing.map((key) => ({
    r2_key: key,
    r2_bucket: process.env.R2_BUCKET_NAME ?? "halo-videos",
    filename_original: key,
    mimetype: "video/mp4",
    titulo: key,
    tipo_video: "sin_clasificar",
    estado: "en_aprobacion",
    origen: "upload_manual",
    estado_procesamiento: "sin_procesar",
    recibido_at: new Date().toISOString(),
    caption: "",
    frase_quemada: "",
    correcciones: "",
  }));

  const { error, count } = await supabase.from("library_content").insert(rows, { count: "exact" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: count ?? missing.length, keys: missing });
}
