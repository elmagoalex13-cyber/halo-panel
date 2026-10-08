import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// POST { pieza_id, tipo: "bien" | "mejorar" | null, texto? }  Feedback de la agencia sobre un reel de una modelo en captacion.
// La modelo lo ve en su portal (pestaña Subidos). tipo null = quitar el feedback.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  { const g = await exigirModelo(id); if (g) return g; }
  const body = (await req.json().catch(() => null)) as { pieza_id?: string; tipo?: string | null; texto?: string } | null;
  if (!body?.pieza_id) return NextResponse.json({ error: "Falta el vídeo" }, { status: 400 });
  const tipo = body.tipo === "bien" || body.tipo === "mejorar" ? body.tipo : null;
  const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 600) : "";

  const { data, error } = await createAdminClient()
    .from("library_content")
    .update({ feedback_tipo: tipo, feedback_texto: tipo ? texto || null : null, feedback_at: tipo ? new Date().toISOString() : null })
    .eq("id", body.pieza_id)
    .eq("modelo_id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ error: /feedback_/.test(error.message) ? "Falta ejecutar el SQL 20261021_feedback_captacion.sql en Supabase." : error.message }, { status: /feedback_/.test(error.message) ? 409 : 500 });
  }
  if (!data?.length) return NextResponse.json({ error: "Vídeo no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
