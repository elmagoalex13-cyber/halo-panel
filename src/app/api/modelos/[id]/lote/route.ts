import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// POST { ids: [...] }   -> manda a EDICION solo esos reels en espera (5, 10, 30... los que queráis); la captacion sigue abierta y lo que
//                          la modelo suba despues se sigue quedando en espera para revisarlo.
// POST { todos: true }  -> manda TODOS los que haya en espera y TERMINA la captacion: desde ahora, lo que suba se edita directamente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  { const g = await exigirModelo(id); if (g) return g; }
  const body = (await req.json().catch(() => null)) as { ids?: unknown; todos?: boolean } | null;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : [];
  if (!ids.length && !body?.todos) return NextResponse.json({ error: "Elige qué reels mandar a edición" }, { status: 400 });

  const db = createAdminClient();
  const ahora = new Date().toISOString();
  let q = db
    .from("library_content")
    .update({ estado: "editando", estado_procesamiento: "pendiente", reparto_at: ahora, updated_at: ahora })
    .eq("modelo_id", id)
    .eq("estado", "recibido");
  if (ids.length) q = q.in("id", ids);
  const { data: pasados, error } = await q.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!ids.length && body?.todos) await db.from("modelos").update({ captacion_aprobada_at: ahora }).eq("id", id);
  return NextResponse.json({ ok: true, aprobados: pasados?.length ?? 0, terminada: !ids.length });
}
