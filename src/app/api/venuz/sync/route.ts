import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// El panel no habla con Venuz: solo deja una peticion en log_agentes. El runner del VPS la ve en
// menos de 30 s, hace el scraping con su login y guarda el resultado en las tablas venuz_*.
export async function POST() {
  if (!canUseSupabase()) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado" }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("log_agentes").insert({
    agente: "venuz_sync",
    accion: "solicitud",
    resultado: "ok",
    detalle: { source: "manual", triggered_at: new Date().toISOString() },
    duracion_ms: 0,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Sync pedido: el runner lo ejecuta en unos segundos" });
}

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ lastSync: null });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("log_agentes")
    .select("created_at, resultado, duracion_ms, detalle")
    .eq("agente", "venuz_sync")
    .eq("accion", "sync")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ lastSync: data ?? null });
}
