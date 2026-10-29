import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { UUID, coleccionDeModelo } from "@/lib/ofServer";
import { marcaQuitado } from "@/lib/onlyfans";
import { borrarObjetoOF } from "@/lib/r2/onlyfans";
import { claveMiniatura } from "@/lib/ofMiniaturas";

export const dynamic = "force-dynamic";

// La modelo quita un archivo de un script, pack o post. Puede hacerlo SIEMPRE, aunque ya lo haya entregado.
// En scripts y packs el archivo NO se borra: pasa a «versiones anteriores» y la agencia conserva la copia. Los posts sí se borran del todo.
export async function DELETE(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: a } = await supabase.from("of_archivos").select("id, coleccion_id, modelo_id, slot, storage_key, bucket").eq("id", id).eq("modelo_id", sesion.modeloId).maybeSingle();
  if (!a) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  const col = await coleccionDeModelo(supabase, a.coleccion_id, sesion.modeloId);
  if (!col) return NextResponse.json({ error: "No se encontró" }, { status: 404 });

  if (col.tipo !== "post") {
    const { error } = await supabase.from("of_archivos").update({ slot: marcaQuitado(a.slot as string | null) }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (col.estado === "entregado") await supabase.from("of_colecciones").update({ entregado_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", col.id);
    return NextResponse.json({ ok: true, conservado: true });
  }

  const { error } = await supabase.from("of_archivos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await borrarObjetoOF(a.storage_key, a.bucket).catch(() => undefined);
  await borrarObjetoOF(claveMiniatura(a.storage_key as string), a.bucket).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
