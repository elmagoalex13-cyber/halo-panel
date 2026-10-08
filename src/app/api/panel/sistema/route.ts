import { NextRequest, NextResponse } from "next/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { guardarRetencion, leerSistema } from "@/lib/sistema";

export const dynamic = "force-dynamic";

// Estado del sistema (editor, cola, limpieza, copias) para Ajustes. Solo lo ve y lo cambia el dueño.
export async function GET() {
  const s = await sesionPanelActual();
  if (!s?.dueno) return NextResponse.json({ error: "Solo el dueño del panel" }, { status: 403 });
  return NextResponse.json(await leerSistema());
}

// PUT { retencion_dias: 0..730 }
export async function PUT(req: NextRequest) {
  const s = await sesionPanelActual();
  if (!s?.dueno) return NextResponse.json({ error: "Solo el dueño del panel" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { retencion_dias?: unknown } | null;
  const dias = Math.round(Number(body?.retencion_dias));
  if (!Number.isFinite(dias) || dias < 0 || dias > 730) return NextResponse.json({ error: "Los días deben estar entre 0 y 730" }, { status: 400 });
  try {
    await guardarRetencion(dias);
    return NextResponse.json({ ok: true, retencion_dias: dias });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: /panel_config|relation|schema cache/i.test(m) ? "Falta ejecutar el SQL 20261019_escala.sql en Supabase." : m }, { status: 500 });
  }
}
