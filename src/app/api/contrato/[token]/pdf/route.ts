import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { getR2Object } from "@/lib/r2";
import { generarPdfContrato } from "@/lib/contratoPdf";

export const dynamic = "force-dynamic";

// PUBLICO: la modelo descarga su contrato (en blanco con sus datos antes de firmar, o el firmado despues). El token es el secreto.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const { token } = await params;
  const { data: c } = await createAdminClient().from("contratos_modelos").select("*").eq("token", token).maybeSingle();
  if (!c || c.estado === "cancelado") return NextResponse.json({ error: "Enlace no disponible" }, { status: 404 });

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
      nombre: c.nombre,
      fechaInicio: c.fecha_inicio,
      firmaAgencia: c.firma_agencia,
      firmaCreadora: c.firma_creadora,
      nombreFirmante: c.nombre_firmante,
      dni: c.dni,
      firmadoAt: c.firmado_at,
      firmanteIp: c.firmante_ip,
    });
  }
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Contrato-Halo-Models.pdf"', "Cache-Control": "private, no-store" },
  });
}
