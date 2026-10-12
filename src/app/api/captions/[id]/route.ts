import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIPOS = ["foto", "propina", "encuesta", "plantilla"];

// PATCH { texto?, tipo?, activa?, tags? } edita un caption. DELETE lo borra.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { texto?: unknown; tipo?: unknown; activa?: unknown; tags?: unknown };
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.texto === "string") {
    const t = b.texto.trim().slice(0, 2000);
    if (!t) return NextResponse.json({ error: "El caption no puede quedar vacío" }, { status: 400 });
    cambios.texto = t;
  }
  if (typeof b.tipo === "string" && TIPOS.includes(b.tipo)) cambios.tipo = b.tipo;
  if (typeof b.activa === "boolean") cambios.activa = b.activa;
  if (Array.isArray(b.tags)) cambios.tags = b.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 12);
  const { error } = await createAdminClient().from("captions").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "Ya existe un caption igual" : error.message }, { status: /duplicate|unique/i.test(error.message) ? 409 : 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const { error } = await createAdminClient().from("captions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
