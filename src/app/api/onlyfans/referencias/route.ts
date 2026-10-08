import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { bucketOF, borrarObjetoOF, tamanoEnR2, urlVista } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

const CATEGORIAS = ["post", "pack", "script_ejemplo"];
const EXT = /^[a-z0-9]{1,5}$/;

// Referencias (fotos y videos de ejemplo) para las modelos: posts, packs y ejemplos de scripts. Las sube la agencia desde OnlyFans.
//  GET                      -> lista con enlace temporal para verlas
//  POST { accion:"firmar" } -> { url, key } para subir el archivo directo a R2
//  POST { accion:"registrar", categoria, key, titulo?, nota?, mime, tipo_archivo } -> la anota (comprueba que el archivo llego)
//  DELETE ?id=              -> borra la fila y el archivo
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await createAdminClient().from("of_referencias").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ referencias: [], tablaLista: false });
  const referencias = await Promise.all(
    (data ?? []).map(async (r) => ({ id: r.id, categoria: r.categoria, titulo: r.titulo, nota: r.nota, tipo_archivo: r.tipo_archivo, mime: r.mime, size_bytes: r.size_bytes, vista: await urlVista(r.storage_key, r.bucket ?? bucketOF()).catch(() => null) })),
  );
  return NextResponse.json({ referencias, tablaLista: true });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const categoria = String(body?.categoria ?? "");
  if (!CATEGORIAS.includes(categoria)) return NextResponse.json({ error: "Categoría no válida" }, { status: 400 });

  if (body?.accion === "firmar") {
    const nombre = String(body.nombre ?? "archivo");
    const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
    const mime = String(body.mime ?? "");
    if (!EXT.test(ext) || !/^(image|video)\//.test(mime)) return NextResponse.json({ error: "Solo fotos o vídeos" }, { status: 400 });
    if (Number(body.size) > 400 * 1024 * 1024) return NextResponse.json({ error: "El archivo supera los 400 MB" }, { status: 413 });
    const key = `of-referencias/${categoria}/${randomUUID()}.${ext}`;
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
    const c = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
      forcePathStyle: true,
    });
    const url = await getSignedUrl(c, new PutObjectCommand({ Bucket: bucketOF(), Key: key, ContentType: mime }), { expiresIn: 3600 });
    return NextResponse.json({ url, key });
  }

  if (body?.accion === "registrar") {
    const key = String(body.key ?? "");
    if (!key.startsWith(`of-referencias/${categoria}/`) || key.includes("..")) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
    const tam = await tamanoEnR2(key);
    if (tam === null) return NextResponse.json({ error: "El archivo no llegó al almacén; vuelve a subirlo" }, { status: 404 });
    const mime = String(body.mime ?? "");
    const { error } = await createAdminClient().from("of_referencias").insert({
      categoria,
      titulo: typeof body.titulo === "string" && body.titulo.trim() ? body.titulo.trim().slice(0, 120) : null,
      nota: typeof body.nota === "string" && body.nota.trim() ? body.nota.trim().slice(0, 500) : null,
      storage_key: key,
      bucket: bucketOF(),
      mime,
      size_bytes: tam,
      tipo_archivo: mime.startsWith("video/") ? "video" : "foto",
    });
    if (error) return NextResponse.json({ error: /of_referencias|relation|schema cache/i.test(error.message) ? "Falta ejecutar el SQL 20261022_guias_y_objetivos.sql en Supabase." : error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  const db = createAdminClient();
  const { data } = await db.from("of_referencias").select("storage_key, bucket").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  try {
    await borrarObjetoOF(data.storage_key, data.bucket ?? bucketOF());
  } catch {
    return NextResponse.json({ error: "No se pudo borrar el archivo del almacén" }, { status: 502 });
  }
  await db.from("of_referencias").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
