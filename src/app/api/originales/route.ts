import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { alcanceActual } from "@/lib/alcance";
import { borrarOriginales } from "@/lib/originales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// DELETE /api/originales   { ids: [<library_content.id>, ...] }
// Borra a mano los archivos ORIGINALES de esas piezas (ver src/lib/originales.ts). Se hace desde la pagina Originales.
export async function DELETE(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 60) : []; // el cliente manda lotes de 30
  if (!ids.length) return NextResponse.json({ error: "Faltan ids" }, { status: 400 });

  const r = await borrarOriginales(ids, await alcanceActual());
  return NextResponse.json(r.body, { status: r.status });
}
