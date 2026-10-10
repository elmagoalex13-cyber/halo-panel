import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { CLAVE_PLANTILLAS_LEADS, PLANTILLAS_POR_DEFECTO, type PlantillasLeads } from "@/lib/leadsMensajes";

export const dynamic = "force-dynamic";

// Mensajes predeterminados para contactar leads (con fotos / sin fotos).
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json(PLANTILLAS_POR_DEFECTO);
  const { data } = await createAdminClient().from("panel_config").select("value").eq("key", CLAVE_PLANTILLAS_LEADS).maybeSingle();
  const v = (data?.value ?? {}) as Partial<PlantillasLeads>;
  return NextResponse.json({ con_fotos: v.con_fotos || PLANTILLAS_POR_DEFECTO.con_fotos, sin_fotos: v.sin_fotos || PLANTILLAS_POR_DEFECTO.sin_fotos });
}

export async function PUT(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Partial<PlantillasLeads>;
  const limpia = (t: unknown) => (typeof t === "string" ? t.trim().slice(0, 1500) : "");
  const valor: PlantillasLeads = { con_fotos: limpia(body.con_fotos), sin_fotos: limpia(body.sin_fotos) };
  if (!valor.con_fotos || !valor.sin_fotos) return NextResponse.json({ error: "Los dos mensajes tienen que tener texto" }, { status: 400 });
  const { error } = await createAdminClient().from("panel_config").upsert({ key: CLAVE_PLANTILLAS_LEADS, value: valor, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...valor });
}
