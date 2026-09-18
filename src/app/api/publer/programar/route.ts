import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { marcarPublicadas, programarPendientes, publerActivo } from "@/lib/publer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Programa en Publer lo que este pendiente (trial reels nuevos y reels aprobados sin fecha).
// Lo llama el runner cada 10 min (Authorization: Bearer CRON_SECRET) y el cron diario de Vercel.
async function ejecutar(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const supabase = createAdminClient();
  await marcarPublicadas(supabase);
  if (!publerActivo()) return NextResponse.json({ ok: true, programados: 0, publer: false });
  const programados = await programarPendientes(supabase);
  return NextResponse.json({ ok: true, programados, publer: true });
}

export const POST = ejecutar;
export const GET = ejecutar;
