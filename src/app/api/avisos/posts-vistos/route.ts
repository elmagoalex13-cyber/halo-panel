import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { marcarPostsAvisosVistos } from "@/lib/postsAvisos";

export const dynamic = "force-dynamic";

// POST { ids: string[] } -> marca como vistos (solo para quien lo pulsa) los avisos de «posts programados»
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: "Faltan avisos" }, { status: 400 });
  await marcarPostsAvisosVistos(sesion.usuario, ids);
  return NextResponse.json({ ok: true });
}
