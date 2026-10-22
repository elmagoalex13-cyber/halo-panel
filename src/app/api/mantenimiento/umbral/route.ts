import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { barridoUmbral } from "@/lib/captacion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Barrido de captacion: avisa de las modelos que ya cumplen todos los minimos y aun no tienen cuenta de Instagram (y les recuerda cada dia).
// Lo llama el editor cada 10 minutos con CRON_SECRET (igual que /api/publer/programar).
async function ejecutar(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await barridoUmbral()) });
}

export const GET = ejecutar;
export const POST = ejecutar;
