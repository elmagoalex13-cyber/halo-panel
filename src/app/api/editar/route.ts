import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, exigirModelo, soloVisibles } from "@/lib/alcance";
import { cambiarEdicionAuto } from "@/lib/edicionManual";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { accion: "enviar", ids: [...] }              -> manda a EDICION esos videos en espera (de una o de varias modelos a la vez)
// POST { accion: "modo", modelo_id, manual }         -> esa modelo: sus videos nuevos esperan aqui (manual, lo normal) o se editan solos (automatico)
// POST { accion: "modo_todas", manual }              -> lo mismo para todas las modelos que ves
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { accion?: string; ids?: unknown; modelo_id?: string; manual?: unknown } | null;
  const db = createAdminClient();

  if (b?.accion === "enviar") {
    const ids = Array.isArray(b.ids) ? [...new Set((b.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 500) : [];
    if (!ids.length) return NextResponse.json({ error: "Elige al menos un vídeo" }, { status: 400 });
    const alcance = await alcanceActual();
    // Solo los que esta persona puede ver, que siguen en espera y que son reels (los TikTok se guardan aparte y no se editan)
    const { data: validos } = await soloVisibles(
      db.from("library_content").select("id").in("id", ids).eq("estado", "recibido").eq("origen", "upload_manual").or("tipo.is.null,tipo.not.in.(3,5)"),
      alcance,
    );
    const buenos = (validos ?? []).map((v) => v.id as string);
    if (!buenos.length) return NextResponse.json({ error: "Esos vídeos ya no están en espera" }, { status: 404 });
    const ahora = new Date().toISOString();
    const { error } = await db.from("library_content").update({ estado: "editando", estado_procesamiento: "pendiente", reparto_at: ahora, updated_at: ahora }).in("id", buenos).eq("estado", "recibido");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, enviados: buenos.length });
  }

  if (b?.accion === "modo") {
    const modeloId = String(b.modelo_id ?? "");
    if (!UUID.test(modeloId) || typeof b.manual !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
    const g = await exigirModelo(modeloId);
    if (g) return g;
    if (!(await cambiarEdicionAuto([modeloId], !b.manual))) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b?.accion === "modo_todas") {
    if (typeof b.manual !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
    const alcance = await alcanceActual();
    const { data: modelos } = await soloVisibles(db.from("modelos").select("id").is("eliminada_at", null), alcance, "id");
    const ids = (modelos ?? []).map((m) => m.id as string);
    if (!(await cambiarEdicionAuto(ids, !b.manual))) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
    return NextResponse.json({ ok: true, modelos: ids.length });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
