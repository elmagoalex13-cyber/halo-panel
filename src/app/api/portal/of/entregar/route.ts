import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { UUID, coleccionDeModelo } from "@/lib/ofServer";
import { encolarTelegram } from "@/lib/telegramCola";
import { evaluarUmbral } from "@/lib/captacion";

export const dynamic = "force-dynamic";

// La modelo da por terminado un script/pack/post: se bloquea y a la agencia le sale como "entregado".
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { coleccion_id?: string } | null;
  if (!body?.coleccion_id || !UUID.test(body.coleccion_id)) return NextResponse.json({ error: "Falta la colección" }, { status: 400 });

  const supabase = createAdminClient();
  const col = await coleccionDeModelo(supabase, body.coleccion_id, sesion.modeloId);
  if (!col) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  const { count } = await supabase.from("of_archivos").select("id", { count: "exact", head: true }).eq("coleccion_id", col.id);
  if (!count) return NextResponse.json({ error: "Todavía no has subido nada" }, { status: 400 });

  const ahora = new Date().toISOString();
  const { error } = await supabase.from("of_colecciones").update({ estado: "entregado", entregado_at: ahora, updated_at: ahora }).eq("id", col.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Telegram: un aviso por script/pack/post entregado (no por archivo)
  await encolarTelegram("of_entrega", sesion.modeloId, { tipo: col.tipo, nombre: col.nombre ?? null, archivos: count });
  await evaluarUmbral(sesion.modeloId); // packs y posts entregados cuentan para poder crear la cuenta de Instagram
  return NextResponse.json({ ok: true, entregado_at: ahora });
}
