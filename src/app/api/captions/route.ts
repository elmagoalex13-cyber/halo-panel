import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import base from "@/lib/captionsBase.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIN_TABLA = "Falta ejecutar el SQL 20261025_captions.sql en Supabase.";
const TIPOS = ["foto", "propina", "encuesta", "plantilla"] as const;
const falta = (m: string) => /captions|relation|schema cache/i.test(m);

// GET  -> todos los captions
// POST { accion: "importar_base" }        -> carga el documento de captions (los que ya estan no se repiten)
// POST { accion: "agregar", texto, tipo? } -> anade uno nuevo
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await createAdminClient().from("captions").select("id, texto, tipo, activa, tags, origen, created_at").order("created_at", { ascending: true }).limit(5000);
  if (error) return NextResponse.json({ error: falta(error.message) ? SIN_TABLA : error.message, sinTabla: falta(error.message) }, { status: falta(error.message) ? 409 : 500 });
  return NextResponse.json({ captions: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { accion?: string; texto?: unknown; tipo?: unknown };
  const db = createAdminClient();

  if (body.accion === "importar_base") {
    const filas = (base as Array<{ texto: string; tipo: string; activa: boolean; tags: string[] }>).map((c) => ({ ...c, origen: "documento" }));
    let nuevos = 0;
    for (let i = 0; i < filas.length; i += 200) {
      const { data, error } = await db.from("captions").upsert(filas.slice(i, i + 200), { onConflict: "texto", ignoreDuplicates: true }).select("id");
      if (error) return NextResponse.json({ error: falta(error.message) ? SIN_TABLA : error.message }, { status: falta(error.message) ? 409 : 500 });
      nuevos += data?.length ?? 0;
    }
    // Los que ya estaban importados reciben su tema (solo si aun no tienen etiquetas: lo que hayas cambiado a mano no se toca)
    const { data: existentes } = await db.from("captions").select("id, texto, tags").eq("origen", "documento").limit(5000);
    const temaDe = new Map(filas.map((f) => [f.texto, f.tags]));
    const grupos = new Map<string, string[]>();
    for (const e of existentes ?? []) {
      const tags = temaDe.get(e.texto as string);
      if (!tags?.length || (e.tags as string[] | null)?.length) continue;
      const k = JSON.stringify(tags);
      grupos.set(k, [...(grupos.get(k) ?? []), e.id as string]);
    }
    let etiquetados = 0;
    for (const [k, ids] of grupos) {
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await db.from("captions").update({ tags: JSON.parse(k) }).in("id", ids.slice(i, i + 100));
        if (!error) etiquetados += Math.min(100, ids.length - i);
      }
    }
    return NextResponse.json({ ok: true, nuevos, total: filas.length, etiquetados });
  }

  if (body.accion === "agregar") {
    const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 2000) : "";
    if (!texto) return NextResponse.json({ error: "Escribe el caption" }, { status: 400 });
    const tipo = TIPOS.includes(body.tipo as (typeof TIPOS)[number]) ? (body.tipo as string) : "foto";
    const { data, error } = await db.from("captions").insert({ texto, tipo, origen: "manual" }).select("id, texto, tipo, activa, tags, origen, created_at").single();
    if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "Ese caption ya existe" : falta(error.message) ? SIN_TABLA : error.message }, { status: /duplicate|unique/i.test(error.message) ? 409 : 500 });
    return NextResponse.json({ ok: true, caption: data });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
