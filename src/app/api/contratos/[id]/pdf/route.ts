import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { getR2Object } from "@/lib/r2";
import { generarPdfContrato } from "@/lib/contratoPdf";

export const dynamic = "force-dynamic";

// PDF del contrato desde el panel: el firmado si ya lo esta; si no, el contrato tal como lo vera la modelo (con la firma de la agencia).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const { data: c } = await createAdminClient().from("contratos_modelos").select("*").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

  let bytes: Uint8Array | null = null;
  if (c.estado === "firmado" && c.pdf_key) {
    try {
      const obj = await getR2Object(c.pdf_key as string);
      bytes = obj.Body ? await obj.Body.transformToByteArray() : null;
    } catch {
      bytes = null;
    }
  }
  if (!bytes) {
    bytes = await generarPdfContrato({
      nombre: c.nombre as string,
      fechaInicio: c.fecha_inicio as string,
      firmaAgencia: c.firma_agencia as string | null,
      firmaCreadora: c.firma_creadora as string | null,
      nombreFirmante: c.nombre_firmante as string | null,
      dni: c.dni as string | null,
      firmadoAt: c.firmado_at as string | null,
      firmanteIp: c.firmante_ip as string | null,
    });
  }
  const nombreArchivo = `Contrato-${String(c.nombre).replace(/[^\w.-]+/g, "_")}${c.estado === "firmado" ? "-firmado" : ""}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombreArchivo}"`, "Cache-Control": "private, no-store" },
  });
}
