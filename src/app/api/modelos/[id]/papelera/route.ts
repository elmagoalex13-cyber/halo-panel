import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { errorDb } from "@/lib/erroresDb";
import { borrarInventario, inventarioDeModelo } from "@/lib/borradoModelo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Borra una modelo DE LA PAPELERA para siempre: todos sus ARCHIVOS del almacen (videos originales y editados, previews, OnlyFans,
// virales propios, foto), todo lo que cuelga de ella en la base de datos y las copias de seguridad de esas filas.
// Solo el dueño, solo si ya esta en la papelera y solo si se envia su nombre exacto (la 2.ª confirmacion).
// Primero se borran los archivos: si alguno falla no se toca la base de datos y se puede reintentar.
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

  // 1) Archivos del almacen
  let archivos = 0;
  try {
    const r = await borrarInventario(await inventarioDeModelo(id));
    archivos = r.total;
    if (r.fallos.length) {
      return NextResponse.json({ error: `No se pudieron borrar ${r.fallos.length} archivo(s) del almacén (${r.fallos[0].slice(0, 120)}). No se ha borrado nada más: vuelve a intentarlo.` }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ error: `No se pudieron borrar los archivos del almacén: ${e instanceof Error ? e.message : "error"}. No se ha borrado nada más.` }, { status: 502 });
  }

  // 2) Base de datos: la modelo y, en cascada, todo lo suyo; despues las credenciales del portal y las copias
  const { data: acceso } = await db.from("vault_panel").select("id").eq("nombre", `portal:${id}`).maybeSingle();
  const { error } = await db.from("modelos").delete().eq("id", id);
  if (error) {
    const e = errorDb(error, "No se pudo borrar");
    return NextResponse.json({ error: e.mensaje }, { status: e.estado });
  }
  if (acceso?.id) {
    await db.from("vault_panel").delete().eq("id", acceso.id);
    await db.from("papelera_filas").delete().eq("tabla", "vault_panel").eq("fila->>id", acceso.id as string);
  }
  await db.from("papelera_filas").delete().or(`fila->>id.eq.${id},fila->>modelo_id.eq.${id}`);
  return NextResponse.json({ ok: true, archivos });
}
