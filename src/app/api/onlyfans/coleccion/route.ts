import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/ofServer";
import { borrarObjetoOF } from "@/lib/r2/onlyfans";
import { exigirFila } from "@/lib/alcance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PATCH  { id, accion: "reabrir" }  -> la modelo puede volver a subir/quitar archivos
export async function PATCH(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { id?: string; accion?: string } | null;
  if (!body?.id || !UUID.test(body.id) || body.accion !== "reabrir") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  { const g = await exigirFila("of_colecciones", body.id); if (g) return g; }
  const { error } = await createAdminClient().from("of_colecciones").update({ estado: "en_curso", entregado_at: null, updated_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=<coleccion>  -> BORRA la coleccion y sus archivos del almacen (para que no se acumulen). No se puede deshacer.
export async function DELETE(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  { const g = await exigirFila("of_colecciones", id); if (g) return g; }
  const supabase = createAdminClient();
  const { data: archivos } = await supabase.from("of_archivos").select("id, storage_key, bucket").eq("coleccion_id", id);
  const fallos: string[] = [];
  await Promise.all(
    (archivos ?? []).map(async (a) => {
      try {
        await borrarObjetoOF(a.storage_key, a.bucket);
      } catch (e) {
        fallos.push(e instanceof Error ? e.message : "error");
      }
    }),
  );
  if (fallos.length) return NextResponse.json({ error: `No se pudieron borrar ${fallos.length} archivos del almacén; no se ha borrado nada más.` }, { status: 502 });

  await supabase.from("of_archivos").delete().eq("coleccion_id", id);
  const { error } = await supabase.from("of_colecciones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, borrados: archivos?.length ?? 0 });
}
