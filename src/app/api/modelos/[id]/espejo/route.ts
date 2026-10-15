import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { estadoEspejo, quitarEspejo, registrarEspejo, RETRASO_MIN } from "@/lib/espejoVideos";

export const dynamic = "force-dynamic";

// Videos de bienvenida (una sola vez: los ultimos 40 asignados a las demas, una hora despues de firmar).
// GET -> estado. POST { accion: "programar" | "ahora" | "cancelar" } -> programarlo dentro de una hora, hacerlo ya, o cancelar lo pendiente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  return NextResponse.json(await estadoEspejo(id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const b = (await req.json().catch(() => ({}))) as { accion?: unknown };
  if (b.accion !== "programar" && b.accion !== "ahora" && b.accion !== "cancelar") return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  const ok = b.accion === "cancelar" ? await quitarEspejo(id) : await registrarEspejo(id, b.accion === "ahora" ? 0 : RETRASO_MIN);
  return ok ? NextResponse.json({ ok: true, ...(await estadoEspejo(id)) }) : NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
}
