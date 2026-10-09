import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const dynamic = "force-dynamic";

// Avisos del dashboard que cada persona ha quitado (id -> cuando). Se guarda por usuario del panel, asi vale en todos sus dispositivos.
const clave = (usuario: string) => `avisos_ocultos:${usuario}`;
const MAX_DIAS = 30; // lo mas antiguo se olvida al guardar

async function leer(usuario: string): Promise<Record<string, string>> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", clave(usuario)).maybeSingle();
    return (data?.value as Record<string, string> | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function GET() {
  const sesion = await sesionPanelActual();
  if (!sesion || !canUseSupabase()) return NextResponse.json({ ocultos: {} });
  return NextResponse.json({ ocultos: await leer(sesion.usuario) });
}

export async function POST(req: NextRequest) {
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { ocultar?: unknown; mostrar?: unknown };
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string" && i.length > 0 && i.length < 400).slice(0, 100) : []);

  const ocultos = await leer(sesion.usuario);
  const ahora = new Date().toISOString();
  for (const id of lista(body.ocultar)) ocultos[id] = ahora;
  for (const id of lista(body.mostrar)) delete ocultos[id];
  const limite = Date.now() - MAX_DIAS * 86400000;
  for (const [id, cuando] of Object.entries(ocultos)) if (new Date(cuando).getTime() < limite) delete ocultos[id];

  const { error } = await createAdminClient().from("panel_config").upsert({ key: clave(sesion.usuario), value: ocultos, updated_at: ahora });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
