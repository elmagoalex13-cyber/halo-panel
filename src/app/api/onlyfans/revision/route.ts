import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirFila } from "@/lib/alcance";
import { evaluarUmbral } from "@/lib/captacion";

export const dynamic = "force-dynamic";

// POST { coleccion_id, revision: "aprobado" | "mejorar" | null, texto? }
// La agencia revisa un script, pack o post de OnlyFans. La modelo ve el resultado en su portal. Los scripts cuentan para la captacion
// (cuenta de Instagram) solo cuando estan APROBADOS. revision null = quitar la revision.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { coleccion_id?: string; revision?: string | null; texto?: string } | null;
  const id = body?.coleccion_id;
  if (!id) return NextResponse.json({ error: "Falta la colección" }, { status: 400 });
  { const g = await exigirFila("of_colecciones", id); if (g) return g; }
  const revision = body?.revision === "aprobado" || body?.revision === "mejorar" ? body.revision : null;
  const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, 800) : "";

  const db = createAdminClient();
  const { data, error } = await db
    .from("of_colecciones")
    .update({ revision, revision_texto: revision ? texto || null : null, revision_at: revision ? new Date().toISOString() : null })
    .eq("id", id)
    .select("modelo_id");
  if (error) {
    const falta = /revision/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta ejecutar el SQL 20261022_guias_y_objetivos.sql en Supabase." : error.message }, { status: falta ? 409 : 500 });
  }
  if (!data?.length) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  await evaluarUmbral(data[0].modelo_id as string);
  return NextResponse.json({ ok: true });
}
