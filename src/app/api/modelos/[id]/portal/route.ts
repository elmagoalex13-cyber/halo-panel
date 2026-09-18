import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { generarPassword, guardarCredencial, leerCredencial, slugify } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// GET: estado del acceso. POST: crea/renueva usuario y contrasena (la contrasena se devuelve UNA vez).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: modelo } = await supabase.from("modelos").select("portal_token").eq("id", id).single();
  const cred = await leerCredencial(id);
  return NextResponse.json({ slug: modelo?.portal_token ?? null, usuario: cred?.usuario ?? null, activo: Boolean(cred && modelo?.portal_token) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { usuario?: string };
  const supabase = createAdminClient();

  const { data: modelo } = await supabase.from("modelos").select("id, nombre, portal_token").eq("id", id).single();
  if (!modelo) return NextResponse.json({ error: "Modelo no encontrada" }, { status: 404 });

  let slug = modelo.portal_token as string | null;
  if (!slug) {
    const base = slugify(modelo.nombre);
    slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: existe } = await supabase.from("modelos").select("id").eq("portal_token", slug).maybeSingle();
      if (!existe) break;
      slug = `${base}-${i}`;
    }
    const { error } = await supabase.from("modelos").update({ portal_token: slug }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actual = await leerCredencial(id);
  const usuario = (body.usuario?.trim() || actual?.usuario || slug).toLowerCase();
  const password = generarPassword();
  await guardarCredencial(id, usuario, password);
  return NextResponse.json({ ok: true, slug, usuario, password });
}
