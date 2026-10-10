import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { CLAVE_FIRMA_AGENCIA } from "@/lib/contratoFirma";

export const dynamic = "force-dynamic";

// Firma de la agencia: se guarda una vez y se usa en todos los contratos nuevos.
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ firma: null });
  const { data } = await createAdminClient().from("panel_config").select("value").eq("key", CLAVE_FIRMA_AGENCIA).maybeSingle();
  return NextResponse.json({ firma: (data?.value as { firma?: string } | undefined)?.firma ?? null });
}

export async function PUT(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { firma?: unknown };
  if (typeof body.firma !== "string" || !body.firma.startsWith("data:image/png;base64,") || body.firma.length > 400_000) return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  const { error } = await createAdminClient().from("panel_config").upsert({ key: CLAVE_FIRMA_AGENCIA, value: { firma: body.firma }, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
