import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles } from "@/lib/alcance";
import { borrarDeR2 } from "@/lib/r2";
import { borrarOriginales } from "@/lib/originales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { ids: [...] }  Borra los ARCHIVOS de piezas ya aprobadas, publicadas o descartadas para liberar espacio: el video editado, el
// original y su vista previa. La fila se conserva (estadisticas) pero deja de aparecer en la Mesa. No se puede deshacer.
const ESTADOS = ["aprobado", "publicado", "rechazado"];

const claveDeUrl = (v: string | null): string | null => {
  if (!v) return null;
  const base = (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (/^https?:\/\//i.test(v)) return base && v.startsWith(`${base}/`) ? decodeURI(v.slice(base.length + 1)).split("?")[0] : null;
  return v;
};

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 60) : [];
  if (!ids.length) return NextResponse.json({ error: "Faltan ids" }, { status: 400 });

  const db = createAdminClient();
  const alcance = await alcanceActual();

  // Si falta la columna (SQL 20261020), no se borra nada
  const prueba = await db.from("library_content").select("archivos_borrados_at").limit(1);
  if (prueba.error) return NextResponse.json({ error: "Falta ejecutar el SQL 20261020_captacion.sql en Supabase." }, { status: 409 });

  const { data } = await soloVisibles(db.from("library_content").select("id, estado, video_procesado_url").in("id", ids), alcance);
  const piezas = ((data ?? []) as Array<{ id: string; estado: string; video_procesado_url: string | null }>).filter((p) => ESTADOS.includes(p.estado));
  if (!piezas.length) return NextResponse.json({ error: "No hay piezas aprobadas, publicadas o descartadas entre las elegidas" }, { status: 400 });

  // 1) Videos editados (uno por pieza)
  const fallidas = new Set<string>();
  await Promise.all(
    piezas.map(async (p) => {
      const clave = claveDeUrl(p.video_procesado_url);
      if (!clave || !(clave.startsWith("procesadas/") || clave.startsWith("editados/"))) return;
      try {
        await borrarDeR2(clave);
      } catch {
        fallidas.add(p.id);
      }
    }),
  );
  const buenas = piezas.filter((p) => !fallidas.has(p.id)).map((p) => p.id);

  // 2) Originales y sus vistas previas (misma logica que la pagina Originales: no toca un original que otra pieza siga usando)
  if (buenas.length) await borrarOriginales(buenas, alcance);

  // 3) La pieza queda sin archivos y fuera de la Mesa
  if (buenas.length) {
    const ahora = new Date().toISOString();
    await db.from("library_content").update({ video_procesado_url: null, archivos_borrados_at: ahora, updated_at: ahora }).in("id", buenas);
  }
  return NextResponse.json({ ok: buenas.length > 0, borrados: buenas, fallos: fallidas.size });
}
