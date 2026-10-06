import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// Crea un script, un pack o un post nuevo de la modelo con sesion.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { tipo?: string; nombre?: string; descripcion?: string } | null;
  const tipo = body?.tipo;
  if (tipo !== "script" && tipo !== "pack" && tipo !== "post") return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });

  const supabase = createAdminClient();
  let nombre = (body?.nombre ?? "").trim().slice(0, 80);
  if (tipo === "script") {
    const { count } = await supabase.from("of_colecciones").select("id", { count: "exact", head: true }).eq("modelo_id", sesion.modeloId).eq("tipo", "script");
    nombre = nombre || `Script ${(count ?? 0) + 1}`;
  } else if (!nombre) {
    return NextResponse.json({ error: tipo === "pack" ? "Ponle un nombre al pack" : "Ponle un título al post" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("of_colecciones")
    .insert({ modelo_id: sesion.modeloId, tipo, nombre, descripcion: (body?.descripcion ?? "").trim().slice(0, 1500) || null })
    .select("*")
    .single();
  if (error) {
    const sinTablas = /of_colecciones|relation/i.test(error.message);
    return NextResponse.json({ error: sinTablas ? "Esta sección aún no está activada. Avisa a tu agencia." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, coleccion: data });
}
