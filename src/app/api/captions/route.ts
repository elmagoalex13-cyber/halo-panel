import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import base from "@/lib/captionsBase.json";
import { leerTodo } from "@/lib/paginar";

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
  const db = createAdminClient();
  const { data, error } = await leerTodo((d, h) => db.from("captions").select("id, texto, tipo, activa, tags, origen, created_at").order("created_at", { ascending: true }).order("id").range(d, h));
  if (error) return NextResponse.json({ error: falta(error.message) ? SIN_TABLA : error.message, sinTabla: falta(error.message) }, { status: falta(error.message) ? 409 : 500 });
  return NextResponse.json({ captions: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { accion?: string; texto?: unknown; tipo?: unknown };
  const db = createAdminClient();

  if (body.accion === "importar_base") {
    // El documento (22 pestañas = 22 temas): los que ya estan en el banco solo reciben su tema (si aun no tienen etiquetas: lo que hayas
    // cambiado a mano no se toca); los que faltan se anaden. Se compara sin espacios ni mayusculas para no duplicar por un salto de linea.
    const clave = (t: string) => t.replace(/[\s\u200b-\u200f\ufeff]+/g, "").toLowerCase();
    const filas = base as Array<{ texto: string; tipo: string; activa: boolean; tags: string[] }>;
    const { data: existentes, error: eLeer } = await leerTodo((d, h) => db.from("captions").select("id, texto, tags").order("id").range(d, h));
    if (eLeer) return NextResponse.json({ error: falta(eLeer.message) ? SIN_TABLA : eLeer.message }, { status: falta(eLeer.message) ? 409 : 500 });
    const porClave = new Map((existentes ?? []).map((e) => [clave(e.texto as string), e]));

    const aInsertar: Array<{ texto: string; tipo: string; activa: boolean; tags: string[]; origen: string }> = [];
    const grupos = new Map<string, string[]>();
    for (const f of filas) {
      const e = porClave.get(clave(f.texto));
      if (!e) {
        aInsertar.push({ ...f, origen: "documento" });
        continue;
      }
      if (!f.tags.length || (e.tags as string[] | null)?.length) continue;
      const k = JSON.stringify(f.tags);
      grupos.set(k, [...(grupos.get(k) ?? []), e.id as string]);
    }

    let nuevos = 0;
    for (let i = 0; i < aInsertar.length; i += 200) {
      const { data, error } = await db.from("captions").upsert(aInsertar.slice(i, i + 200), { onConflict: "texto", ignoreDuplicates: true }).select("id");
      if (error) return NextResponse.json({ error: falta(error.message) ? SIN_TABLA : error.message }, { status: falta(error.message) ? 409 : 500 });
      nuevos += data?.length ?? 0;
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
