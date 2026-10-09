import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { NOMBRE_CARPETA_POSTS } from "@/lib/onlyfans";

export const dynamic = "force-dynamic";

// Crea un script o un pack nuevo de la modelo con sesion. Los posts NO se crean uno a uno: van todos a una sola carpeta
// («Posts», tipo post), que se crea la primera vez (unica: true) y despues se devuelve la misma.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { tipo?: string; nombre?: string; descripcion?: string } | null;
  const tipo = body?.tipo;
  if (tipo !== "script" && tipo !== "pack" && tipo !== "post") return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });

  const supabase = createAdminClient();
  if (tipo === "post") {
    const { data: existente } = await supabase.from("of_colecciones").select("*").eq("modelo_id", sesion.modeloId).eq("tipo", "post").eq("nombre", NOMBRE_CARPETA_POSTS).eq("estado", "en_curso").order("created_at").limit(1).maybeSingle();
    if (existente) return NextResponse.json({ ok: true, coleccion: existente });
    const { data: nueva, error: errNueva } = await supabase.from("of_colecciones").insert({ modelo_id: sesion.modeloId, tipo: "post", nombre: NOMBRE_CARPETA_POSTS }).select("*").single();
    if (errNueva) {
      const sinTablas = /of_colecciones|relation/i.test(errNueva.message);
      return NextResponse.json({ error: sinTablas ? "Esta sección aún no está activada. Avisa a tu agencia." : errNueva.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, coleccion: nueva });
  }
  let nombre = (body?.nombre ?? "").trim().slice(0, 80);
  if (tipo === "script") {
    const { count } = await supabase.from("of_colecciones").select("id", { count: "exact", head: true }).eq("modelo_id", sesion.modeloId).eq("tipo", "script");
    nombre = nombre || `Script ${(count ?? 0) + 1}`;
  } else if (!nombre) {
    return NextResponse.json({ error: "Ponle un nombre al pack" }, { status: 400 });
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
