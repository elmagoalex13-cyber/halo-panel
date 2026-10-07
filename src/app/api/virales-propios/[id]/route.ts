import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirFila } from "@/lib/alcance";

export const dynamic = "force-dynamic";

const ESTADOS = new Set(["pendiente", "aprobado", "subido", "descartado"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  { const g = await exigirFila("virales_propios", id); if (g) return g; }
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { estado?: string } | null;
  if (!body?.estado || !ESTADOS.has(body.estado)) return NextResponse.json({ error: "Estado invalido" }, { status: 400 });

  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = { estado: body.estado };
  if (body.estado === "aprobado") cambios.aprobado_at = ahora;
  if (body.estado === "subido") cambios.subido_at = ahora;
  if (body.estado === "pendiente") {
    cambios.aprobado_at = null;
    cambios.subido_at = null;
  }

  const { error } = await createAdminClient().from("virales_propios").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
