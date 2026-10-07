import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { errorDb } from "@/lib/erroresDb";

export const dynamic = "force-dynamic";

// Borra una modelo DE LA PAPELERA para siempre (con todo lo que cuelga de ella en la base de datos) y las copias de seguridad
// de esas filas. Solo el dueño, solo si ya esta en la papelera y solo si se envia su nombre exacto (la 2.ª confirmacion).
// Ojo: los archivos de video guardados en R2 no se tocan.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionPanelActual();
  if (!sesion?.dueno) return NextResponse.json({ error: "Solo el dueño del panel puede borrar para siempre" }, { status: 403 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { confirmar?: string } | null;

  const db = createAdminClient();
  const { data: modelo, error: errLeer } = await db.from("modelos").select("id, nombre, eliminada_at").eq("id", id).maybeSingle();
  if (errLeer) return NextResponse.json({ error: errorDb(errLeer).mensaje }, { status: 500 });
  if (!modelo) return NextResponse.json({ error: "Modelo no encontrada" }, { status: 404 });
  if (!modelo.eliminada_at) return NextResponse.json({ error: "Solo se puede borrar para siempre una modelo que ya está en la papelera" }, { status: 409 });
  if ((body?.confirmar ?? "").trim().toLowerCase() !== String(modelo.nombre).trim().toLowerCase()) {
    return NextResponse.json({ error: "El nombre escrito no coincide" }, { status: 400 });
  }

  const { error } = await db.from("modelos").delete().eq("id", id);
  if (error) {
    const e = errorDb(error, "No se pudo borrar");
    return NextResponse.json({ error: e.mensaje }, { status: e.estado });
  }
  // Las copias que dejo la red de seguridad (la propia modelo y todo lo que colgaba de ella)
  await db.from("papelera_filas").delete().or(`fila->>id.eq.${id},fila->>modelo_id.eq.${id}`);
  return NextResponse.json({ ok: true });
}
