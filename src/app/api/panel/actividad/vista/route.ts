import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const dynamic = "force-dynamic";

// El dueño ha abierto la actividad de su socio: lo sensible deja de contar como "nuevo" en el menu lateral.
export async function POST() {
  const sesion = await sesionPanelActual();
  if (!sesion?.dueno) return NextResponse.json({ error: "Solo el dueño del panel" }, { status: 403 });
  if (!canUseSupabase()) return NextResponse.json({ ok: true });
  const { error } = await createAdminClient().from("panel_actividad").update({ vista_at: new Date().toISOString() }).eq("sensible", true).is("vista_at", null);
  return NextResponse.json({ ok: !error });
}
