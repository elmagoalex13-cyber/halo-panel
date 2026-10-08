import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, modeloProhibido, veModelo } from "@/lib/alcance";
import { encolarAsignaciones } from "@/lib/telegramCola";
import { asignarVideoAModelos } from "@/lib/asignarReferencia";

export const dynamic = "force-dynamic";

// Aprueba un video viral del scraper (o lo anade a mas modelos si ya estaba aprobado). Si el video tiene archivo
// descargado, la modelo lo ve en su portal; si no, solo los tipos 1-3 pueden caer a una tarea simple sin video.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { modelo_id?: string; modelo_ids?: string[]; tipo?: number; instrucciones?: string | null };
  const modelos = Array.from(new Set(body.modelo_ids?.length ? body.modelo_ids : body.modelo_id ? [body.modelo_id] : []));
  const tipo = Number(body.tipo);
  if (!modelos.length) return NextResponse.json({ error: "Elige al menos una modelo" }, { status: 400 });
  { const a = await alcanceActual(); if (!modelos.every((m) => veModelo(a, m))) return modeloProhibido(); }
  if (![1, 2, 3, 4].includes(tipo)) return NextResponse.json({ error: "Elige un tipo de video (1-4)" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  try {
    const r = await asignarVideoAModelos(createAdminClient(), id, modelos, { tipo, instrucciones: body.instrucciones });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    await encolarAsignaciones(new Map(r.nuevos.map((m) => [m, 1])));
    return NextResponse.json({ ok: true, referencia_id: r.referenciaId, encargo_ids: r.encargoIds, confirmado_at: r.confirmadoAt, nuevos: r.nuevos.length, ya_tenian: r.yaTenian.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error interno" }, { status: 500 });
  }
}
