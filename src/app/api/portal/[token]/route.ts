import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const supabase = createAdminClient();

    // Verificar token
    const { data: modelo, error: mErr } = await supabase
      .from("modelos")
      .select("id, nombre")
      .eq("portal_token", token)
      .single();

    if (mErr || !modelo) return NextResponse.json({ error: "Token inválido" }, { status: 404 });

    // Asignaciones pendientes
    const { data: asignaciones, error: aErr } = await supabase
      .from("asignaciones_modelo")
      .select("id, tipo, r2_key_referencia, url_referencia_ig, instrucciones, estado, creado_en")
      .eq("modelo_id", modelo.id)
      .eq("estado", "pendiente")
      .order("creado_en", { ascending: true });

    if (aErr) throw aErr;

    const R2_BASE = process.env.R2_PUBLIC_URL ?? "";
    const rows = (asignaciones ?? []).map((a) => ({
      ...a,
      url_referencia_video: a.r2_key_referencia
        ? `${R2_BASE.replace(/\/$/, "")}/${a.r2_key_referencia}`
        : null,
    }));

    return NextResponse.json({ modelo, asignaciones: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
