import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { BUCKET_FOTOS } from "@/lib/fotosModelos";

export const dynamic = "force-dynamic";

// Foto de perfil de cada modelo. Bucket PRIVADO (no R2: su bucket es publico): solo se sirve
// a traves de esta ruta, protegida por el middleware del panel (solo admin). El nombre del
// archivo es el id de la modelo, asi que no hace falta ninguna columna nueva en la base de datos.
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function asegurarBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase.storage.getBucket(BUCKET_FOTOS);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET_FOTOS, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !canUseSupabase()) return new NextResponse(null, { status: 404 });
  const { data, error } = await createAdminClient().storage.from(BUCKET_FOTOS).download(id);
  if (error || !data) return new NextResponse(null, { status: 404 });
  // La URL lleva ?v=<timestamp>, asi que cada foto nueva es otra URL: se puede cachear fuerte.
  return new NextResponse(await data.arrayBuffer(), {
    headers: { "Content-Type": data.type || "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Id invalido" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  if (!TIPOS.has(file.type)) return NextResponse.json({ error: "Formato no valido (usa JPG, PNG o WebP)" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen pesa demasiado (maximo 3 MB)" }, { status: 413 });

  const supabase = createAdminClient();
  const { data: modelo } = await supabase.from("modelos").select("id").eq("id", id).maybeSingle();
  if (!modelo) return NextResponse.json({ error: "Modelo no encontrada" }, { status: 404 });

  try {
    await asegurarBucket(supabase);
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(id, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar la foto" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, v: Date.now() });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !canUseSupabase()) return NextResponse.json({ error: "Id invalido" }, { status: 400 });
  const { error } = await createAdminClient().storage.from(BUCKET_FOTOS).remove([id]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
