import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { UUID, coleccionDeModelo } from "@/lib/ofServer";
import { borrarObjetoOF } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

// La modelo quita un archivo que subió por error (solo mientras la colección no esté entregada).
export async function DELETE(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: a } = await supabase.from("of_archivos").select("id, coleccion_id, modelo_id, storage_key, bucket").eq("id", id).eq("modelo_id", sesion.modeloId).maybeSingle();
  if (!a) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  const col = await coleccionDeModelo(supabase, a.coleccion_id, sesion.modeloId);
  if (!col || col.estado === "entregado") return NextResponse.json({ error: "Ya está entregada: no se puede quitar" }, { status: 409 });

  const { error } = await supabase.from("of_archivos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await borrarObjetoOF(a.storage_key, a.bucket).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
