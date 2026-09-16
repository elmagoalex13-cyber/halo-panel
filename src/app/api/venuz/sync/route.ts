import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  const inicio = Date.now();

  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, message: "Sync iniciado", demo: true });
  }

  const supabase = createAdminClient();
  try {
    await supabase.from("log_agentes").insert({
      agente: "venuz-sync",
      accion: "manual_sync_triggered",
      resultado: "ok",
      detalle: { source: "manual", triggered_at: new Date().toISOString() },
      duracion_ms: Date.now() - inicio,
    });
    return NextResponse.json({ ok: true, message: "Sync iniciado" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ lastSync: { created_at: new Date().toISOString(), resultado: "ok", duracion_ms: 0 } });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("log_agentes")
    .select("created_at, resultado, duracion_ms")
    .eq("agente", "venuz-sync")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ lastSync: data ?? null });
}
