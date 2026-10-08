import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { borrarOriginales } from "@/lib/originales";
import { guardarEstado, leerSistema } from "@/lib/sistema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Limpieza automatica (cron diario de Vercel): borra del almacen el ORIGINAL de los reels que ya se publicaron (o se descartaron) hace
// mas de N dias, donde N lo eliges en Ajustes (0 = nunca). Los videos editados y todo lo demas se conservan; solo se libera el original.
// Autoriza el propio cron de Vercel con CRON_SECRET (igual que /api/publer/programar).
async function ejecutar(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const { retencionDias, retencionActiva } = await leerSistema();
  // No se borra nada solo hasta que el dueño elija los dias en Ajustes (0 = nunca)
  if (!retencionActiva || !retencionDias) return NextResponse.json({ ok: true, desactivado: true });

  const limite = new Date(Date.now() - retencionDias * 86400000).toISOString();
  const db = createAdminClient();
  const { data, error } = await db
    .from("library_content")
    .select("id")
    .is("original_borrado_at", null)
    .in("estado", ["publicado", "rechazado", "archivado"])
    .or("tipo.is.null,tipo.neq.5")
    .or("r2_key_original.like.bruto/%,r2_key.like.bruto/%,r2_key_original.like.supabase://%,r2_key.like.supabase://%")
    .or(`publicado_at.lt.${limite},and(publicado_at.is.null,updated_at.lt.${limite})`)
    .order("updated_at", { ascending: true })
    .limit(240);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((r) => r.id as string);
  let borrados = 0;
  for (let i = 0; i < ids.length; i += 60) {
    const r = await borrarOriginales(ids.slice(i, i + 60), { dueno: true, modelos: null });
    borrados += Number(r.body.borrados ?? 0);
  }
  await guardarEstado("limpieza_originales", { at: new Date().toISOString(), borrados, dias: retencionDias });
  return NextResponse.json({ ok: true, candidatos: ids.length, borrados, dias: retencionDias });
}

export const GET = ejecutar;
export const POST = ejecutar;
