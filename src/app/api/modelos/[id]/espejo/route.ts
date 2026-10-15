import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { enEspejo, quitarEspejo, registrarEspejo } from "@/lib/espejoVideos";

export const dynamic = "force-dynamic";

// GET -> ¿esta la modelo en «videos al dia»? POST { activo } -> la apunta (recibe los ultimos 40 asignados a las demas y los nuevos) o la quita.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  return NextResponse.json({ activo: await enEspejo(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const b = (await req.json().catch(() => ({}))) as { activo?: unknown };
  if (typeof b.activo !== "boolean") return NextResponse.json({ error: "Falta activo" }, { status: 400 });
  const ok = b.activo ? await registrarEspejo(id) : await quitarEspejo(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
}
