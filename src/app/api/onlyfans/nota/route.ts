import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { UUID } from "@/lib/ofServer";
import { exigirFila, modeloDeFila } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { guardarNotaOF } from "@/lib/notasOF";

export const dynamic = "force-dynamic";

// POST { coleccion_id, texto } -> guarda la nota interna del script/pack/post (texto vacio = la quita)
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { coleccion_id?: string; texto?: unknown } | null;
  if (!b?.coleccion_id || !UUID.test(b.coleccion_id)) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  { const g = await exigirFila("of_colecciones", b.coleccion_id); if (g) return g; }
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const modeloId = await modeloDeFila("of_colecciones", b.coleccion_id);
  if (!modeloId) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 2000) : "";
  try {
    const nota = await guardarNotaOF(modeloId, b.coleccion_id, texto, sesion.nombre || sesion.usuario);
    return NextResponse.json({ ok: true, nota });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
}
