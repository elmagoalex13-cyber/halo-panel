import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { errorDb } from "@/lib/erroresDb";

export const dynamic = "force-dynamic";

// Saca una modelo de la papelera. Solo el dueño.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionPanelActual();
  if (!sesion?.dueno) return NextResponse.json({ error: "Solo el dueño del panel puede restaurar modelos" }, { status: 403 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const { error } = await createAdminClient().from("modelos").update({ eliminada_at: null, eliminada_por: null }).eq("id", id);
  if (error) {
    const e = errorDb(error, "No se pudo restaurar");
    return NextResponse.json({ error: e.estado === 409 ? "No se puede restaurar: ya hay otra modelo con ese email. Cambia el email de una de las dos." : e.mensaje }, { status: e.estado });
  }
  return NextResponse.json({ ok: true });
}
