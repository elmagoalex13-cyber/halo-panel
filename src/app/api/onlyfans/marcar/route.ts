import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/ofServer";

export const dynamic = "force-dynamic";

// POST /api/onlyfans/marcar  { coleccion_id, fase?, subido: boolean }
// Marca como "ya subido a OnlyFans" (o lo desmarca) una fase de un script o toda la coleccion (packs y posts).
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { coleccion_id?: string; fase?: number | null; subido?: boolean } | null;
  if (!body?.coleccion_id || !UUID.test(body.coleccion_id) || typeof body.subido !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });

  const supabase = createAdminClient();
  const ahora = body.subido ? new Date().toISOString() : null;
  let q = supabase.from("of_archivos").update({ subido_of_at: ahora }).eq("coleccion_id", body.coleccion_id);
  if (typeof body.fase === "number") q = q.eq("fase", body.fase);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // En packs y posts (sin fases) la marca tambien queda en la propia coleccion
  if (typeof body.fase !== "number") await supabase.from("of_colecciones").update({ subido_of_at: ahora, updated_at: new Date().toISOString() }).eq("id", body.coleccion_id);
  return NextResponse.json({ ok: true, subido_of_at: ahora });
}
