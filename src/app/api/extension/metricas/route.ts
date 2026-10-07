import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// Actualizar las metricas de videos que ya estan guardados (sin volver a descargar nada).
//  GET  ?modo=referencias|propias  -> videos a actualizar: [{ id, codigo }]
//  POST { modo, actualizaciones: [{ id, vistas, likes, comentarios, compartidos }] }
// En referencias_videos las metricas extra viven en tags ("m:clave=valor"); la marca meta:metricas=<fecha>
// indica que ya se actualizaron con la version nueva de la extension (que lee los reposts).

const claveTag = (t: string) => t.match(/^(?:m|meta):([a-z_]+)=/)?.[1] ?? null;
const hoy = () => new Date().toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const modo = req.nextUrl.searchParams.get("modo");
  const supabase = createAdminClient();

  if (modo === "referencias") {
    const { data, error } = await supabase.from("referencias_videos").select("id, tags").order("created_at", { ascending: false }).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const videos = (data ?? [])
      .map((v) => {
        const tags = (v.tags ?? []) as string[];
        return { id: v.id as string, codigo: tags.find((t) => t.startsWith("m:codigo="))?.slice("m:codigo=".length) ?? null, hecho: tags.some((t) => t.startsWith("meta:metricas=")) };
      })
      .filter((v) => v.codigo && !v.hecho)
      .slice(0, 400);
    return NextResponse.json({ videos: videos.map(({ id, codigo }) => ({ id, codigo })) });
  }

  if (modo === "propias") {
    const { data, error } = await soloVisibles(supabase.from("virales_propios").select("id, codigo").eq("compartidos", 0).limit(400), await alcanceActual());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ videos: data ?? [] });
  }

  return NextResponse.json({ error: "modo debe ser referencias o propias" }, { status: 400 });
}

type Actualizacion = { id: string; vistas: number; likes: number; comentarios: number; compartidos: number };

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { modo?: string; actualizaciones?: unknown } | null;
  if (!body || (body.modo !== "referencias" && body.modo !== "propias") || !Array.isArray(body.actualizaciones)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const lista: Actualizacion[] = body.actualizaciones.slice(0, 500).filter((a) => typeof a?.id === "string").map((a) => ({
    id: a.id, vistas: num(a.vistas), likes: num(a.likes), comentarios: num(a.comentarios), compartidos: num(a.compartidos),
  }));
  const supabase = createAdminClient();
  let hechos = 0;

  if (body.modo === "propias") {
    const alcance = await alcanceActual();
    for (const a of lista) {
      const { error } = await soloVisibles(supabase.from("virales_propios").update({ vistas: a.vistas, likes: a.likes, comentarios: a.comentarios, compartidos: a.compartidos }).eq("id", a.id), alcance);
      if (!error) hechos++;
    }
    return NextResponse.json({ ok: true, hechos });
  }

  const { data: actuales } = await supabase.from("referencias_videos").select("id, tags").in("id", lista.map((a) => a.id));
  const tagsPorId = new Map((actuales ?? []).map((v) => [v.id as string, (v.tags ?? []) as string[]]));
  for (const a of lista) {
    const previos = tagsPorId.get(a.id);
    if (!previos) continue;
    const quitar = new Set(["comentarios", "compartidos", "tasa_comentarios", "tasa_compartidos", "metricas"]);
    const tags = previos.filter((t) => !quitar.has(claveTag(t) ?? ""));
    tags.push(
      `m:comentarios=${a.comentarios}`,
      `m:compartidos=${a.compartidos}`,
      `meta:tasa_comentarios=${(a.vistas > 0 ? a.comentarios / a.vistas : 0).toFixed(5)}`,
      `meta:tasa_compartidos=${(a.vistas > 0 ? a.compartidos / a.vistas : 0).toFixed(5)}`,
      `meta:metricas=${hoy()}`,
    );
    const cambios: Record<string, unknown> = { tags, likes: a.likes };
    if (a.vistas > 0) cambios.visitas = a.vistas;
    const { error } = await supabase.from("referencias_videos").update(cambios).eq("id", a.id);
    if (!error) hechos++;
  }
  return NextResponse.json({ ok: true, hechos });
}
