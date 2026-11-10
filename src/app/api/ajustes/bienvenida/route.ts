import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { espejoActivo, fijarEspejoActivo } from "@/lib/espejoVideos";

export const dynamic = "force-dynamic";

// GET -> { activo }      POST { activo: boolean }  (solo el dueño)
export async function GET() {
  const sesion = await sesionPanelActual();
  if (!sesion?.dueno) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  return NextResponse.json({ activo: canUseSupabase() ? await espejoActivo() : true });
}

export async function POST(req: NextRequest) {
  const sesion = await sesionPanelActual();
  if (!sesion?.dueno) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { activo?: unknown } | null;
  if (typeof b?.activo !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (!(await fijarEspejoActivo(b.activo))) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ ok: true, activo: b.activo });
}
