import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/portalAuth";
import { completarMultipart } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

// Cierra una subida por partes (archivos grandes).
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: string; uploadId?: string; parts?: Array<{ partNumber: number; etag: string }> } | null;
  if (!body?.key?.startsWith(`onlyfans/${sesion.modeloId}/`) || body.key.includes("..") || !body.uploadId || !Array.isArray(body.parts) || !body.parts.length) {
    return NextResponse.json({ error: "Subida no válida" }, { status: 400 });
  }
  try {
    await completarMultipart(body.key, body.uploadId, body.parts);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo finalizar la subida" }, { status: 500 });
  }
}
