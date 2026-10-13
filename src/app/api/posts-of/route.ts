import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, exigirModelo, soloVisibles } from "@/lib/alcance";
import { miniaturasDeModelo, urlVistaFoto } from "@/lib/ofMiniaturas";
import { leerTodo } from "@/lib/paginar";
import { cuentaVenuzActiva, prepararPosts, rellenarCaptions } from "@/lib/postsOF";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIN_TABLA = "Falta ejecutar el SQL 20261025_posts_programados.sql en Supabase.";
const falta = (m: string) => /posts_programados|posts_cada_dias|posts_venuz_activo|relation|schema cache/i.test(m);

// GET  -> las modelos con perfil activo en Venuz, sus posts (con foto, caption y fecha) y cuantas fotos nuevas hay por preparar
// POST { accion: "preparar", modelo_id }                    -> crea posts de las fotos nuevas (caption del banco + hueco)
// POST { accion: "ajustes", modelo_id, cada_dias, venuz_activo }
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const db = createAdminClient();
  const alcance = await alcanceActual();
  const { data: cuentas } = await soloVisibles(db.from("venuz_cuentas").select("modelo_id").eq("activa", true).not("modelo_id", "is", null), alcance, "modelo_id");
  const ids = [...new Set((cuentas ?? []).map((c) => c.modelo_id as string))];
  if (!ids.length) return NextResponse.json({ modelos: [] });

  // Los posts por revisar que se quedaron sin caption reciben uno del banco
  for (const id of ids) await rellenarCaptions(db, id).catch(() => 0);

  const [{ data: modelos, error: eM }, { data: posts, error: eP }] = await Promise.all([
    db.from("modelos").select("id, nombre, posts_cada_dias, posts_venuz_activo, posts_fan_baul").in("id", ids).is("eliminada_at", null).order("nombre"),
    leerTodo<Record<string, unknown> & { id: string; modelo_id: string; archivo_id: string }>((d, h) => db.from("posts_programados").select("id, modelo_id, archivo_id, caption, caption_motivo, estado, programar_para, error, aprobado_por").in("modelo_id", ids).neq("estado", "descartado").order("programar_para", { ascending: true }).order("id").range(d, h)),
  ]);
  const err = eM?.message ?? eP?.message;
  if (err) return NextResponse.json({ error: falta(err) ? SIN_TABLA : err, sinTabla: falta(err) }, { status: falta(err) ? 409 : 500 });

  const { data: descartados } = await leerTodo<{ modelo_id: string; archivo_id: string }>((d, h) => db.from("posts_programados").select("modelo_id, archivo_id").in("modelo_id", ids).eq("estado", "descartado").order("id").range(d, h));
  const { data: archivos } = await leerTodo<{ id: string; modelo_id: string; storage_key: string; bucket: string; tipo_archivo: string; coleccion_id: string; created_at: string }>((d, h) => db.from("of_archivos").select("id, modelo_id, storage_key, bucket, tipo_archivo, coleccion_id, created_at").in("modelo_id", ids).eq("tipo_archivo", "foto").order("id").range(d, h));
  const { data: cols } = await db.from("of_colecciones").select("id").in("modelo_id", ids).eq("tipo", "post");
  const colPost = new Set((cols ?? []).map((c) => c.id as string));
  const porArchivo = new Map((archivos ?? []).map((a) => [a.id as string, a]));

  const salida = [];
  for (const m of modelos ?? []) {
    const minis = await miniaturasDeModelo(m.id as string);
    const mios = (posts ?? []).filter((p) => p.modelo_id === m.id);
    const hechos = new Set([...mios.map((p) => p.archivo_id as string), ...descartados.filter((d) => d.modelo_id === m.id).map((d) => d.archivo_id)]);
    const nuevas = (archivos ?? []).filter((a) => a.modelo_id === m.id && colPost.has(a.coleccion_id as string) && !hechos.has(a.id as string)).length;
    const lista = await Promise.all(
      mios.map(async (p) => {
        const a = porArchivo.get(p.archivo_id as string);
        return { ...p, vista: a ? await urlVistaFoto(a.storage_key as string, a.bucket as string, minis).catch(() => null) : null };
      }),
    );
    salida.push({ id: m.id, nombre: m.nombre, cada_dias: m.posts_cada_dias ?? 1, venuz_activo: Boolean(m.posts_venuz_activo), fan_baul: (m.posts_fan_baul as string | null) ?? "", nuevas, posts: lista });
  }
  return NextResponse.json({ modelos: salida });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { accion?: string; modelo_id?: string; cada_dias?: unknown; venuz_activo?: unknown; fan_baul?: unknown };
  const modeloId = String(body.modelo_id ?? "");
  const g = await exigirModelo(modeloId);
  if (g) return g;
  const db = createAdminClient();

  if (body.accion === "ajustes") {
    const cambios: Record<string, unknown> = {};
    const d = Math.round(Number(body.cada_dias));
    if (Number.isFinite(d) && d >= 1 && d <= 7) cambios.posts_cada_dias = d;
    if (typeof body.venuz_activo === "boolean") cambios.posts_venuz_activo = body.venuz_activo;
    if (typeof body.fan_baul === "string") {
      const f = body.fan_baul.replace(/\D/g, "");
      if (f && (f.length < 5 || f.length > 15)) return NextResponse.json({ error: "El ID del fan son solo números (unos 9 dígitos)" }, { status: 400 });
      cambios.posts_fan_baul = f || null;
    }
    const { error } = await db.from("modelos").update(cambios).eq("id", modeloId);
    if (error) return NextResponse.json({ error: falta(error.message) ? SIN_TABLA : error.message }, { status: falta(error.message) ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.accion === "preparar") {
    if (!(await cuentaVenuzActiva(db, modeloId))) return NextResponse.json({ error: "Esta modelo no tiene un perfil activo en Venuz" }, { status: 409 });
    try {
      return NextResponse.json({ ok: true, ...(await prepararPosts(db, modeloId)) });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Error";
      return NextResponse.json({ error: falta(m) ? SIN_TABLA : m }, { status: falta(m) ? 409 : 500 });
    }
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
