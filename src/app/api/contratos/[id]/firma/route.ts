import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { puedeVerContratoId } from "@/lib/contratoAmbito";

export const dynamic = "force-dynamic";

// Imagen PNG de una de las firmas del contrato (para la vista previa de la ficha): ?quien=agencia | modelo. Solo desde el panel.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  if (!(await puedeVerContratoId(id))) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  const quien = req.nextUrl.searchParams.get("quien") === "modelo" ? "firma_creadora" : "firma_agencia";
  const { data } = await createAdminClient().from("contratos_modelos").select("firma_agencia, firma_creadora").eq("id", id).maybeSingle();
  const url = (data as Record<string, string | null> | null)?.[quien];
  const m = typeof url === "string" ? /^data:image\/png;base64,(.+)$/.exec(url) : null;
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[1], "base64"), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
