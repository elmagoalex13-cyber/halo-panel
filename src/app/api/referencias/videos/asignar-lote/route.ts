import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, modeloProhibido, veModelo } from "@/lib/alcance";
import { encolarAsignaciones } from "@/lib/telegramCola";
import { asignarVideoAModelos, type CacheCuentas } from "@/lib/asignarReferencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Asigna varios videos virales de golpe a varias modelos, cada uno con el tipo de edicion que ya tiene confirmado.
// Sirve para videos por revisar (los aprueba) y para videos ya aprobados (los anade a mas modelos).
// POST { video_ids: [...], modelo_ids: [...], instrucciones? }  -> el cliente lo manda en tandas pequenas
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { video_ids?: unknown; modelo_ids?: unknown; instrucciones?: string | null };
  const videos = Array.isArray(body.video_ids) ? [...new Set((body.video_ids as unknown[]).filter((x): x is string => typeof x === "string"))].slice(0, 25) : [];
  const modelos = Array.isArray(body.modelo_ids) ? [...new Set((body.modelo_ids as unknown[]).filter((x): x is string => typeof x === "string"))].slice(0, 100) : [];
  if (!videos.length) return NextResponse.json({ error: "Elige al menos un vídeo" }, { status: 400 });
  if (!modelos.length) return NextResponse.json({ error: "Elige al menos una modelo" }, { status: 400 });
  const alcance = await alcanceActual();
  if (!modelos.every((m) => veModelo(alcance, m))) return modeloProhibido();

  const db = createAdminClient();
  const cuentas: CacheCuentas = new Map();
  const nuevosPorModelo = new Map<string, number>();
  const okIds: string[] = [];
  let yaTenian = 0;
  const fallos: Array<{ id: string; error: string }> = [];
  for (const id of videos) {
    try {
      const r = await asignarVideoAModelos(db, id, modelos, { instrucciones: body.instrucciones, cuentas });
      if (!r.ok) {
        fallos.push({ id, error: r.error });
        continue;
      }
      okIds.push(id);
      yaTenian += r.yaTenian.length;
      for (const m of r.nuevos) nuevosPorModelo.set(m, (nuevosPorModelo.get(m) ?? 0) + 1);
    } catch (e) {
      fallos.push({ id, error: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error" });
    }
  }
  await encolarAsignaciones(nuevosPorModelo);
  const encargos = [...nuevosPorModelo.values()].reduce((a, b) => a + b, 0);
  return NextResponse.json({ ok: true, videos: okIds.length, ok_ids: okIds, encargos, ya_tenian: yaTenian, fallos });
}
