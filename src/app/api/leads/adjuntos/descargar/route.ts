import { NextRequest, NextResponse } from "next/server";
import { keyR2 } from "@/lib/media";
import { getR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(value: string | null, fallback: string) {
  const base = (value || fallback).replace(/[^\w.\- ]+/g, "_").trim().slice(0, 120);
  return base || fallback;
}

// GET /api/leads/adjuntos/descargar?key=<r2-key>&name=<filename>
// Protegida por middleware admin. Solo permite adjuntos del formulario web dentro de leads/.
export async function GET(req: NextRequest) {
  const key = keyR2(req.nextUrl.searchParams.get("key"));
  const name = safeFilename(req.nextUrl.searchParams.get("name"), key?.split("/").pop() ?? "lead-adjunto");

  if (!key) return NextResponse.json({ error: "key requerido" }, { status: 400 });
  if (!key.startsWith("leads/")) return NextResponse.json({ error: "Adjunto no permitido" }, { status: 403 });

  try {
    const obj = await getR2Object(key);
    if (!obj.Body) return NextResponse.json({ error: "Objeto vacio" }, { status: 404 });

    const headers = new Headers({
      "Content-Type": obj.ContentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    });
    if (obj.ContentLength) headers.set("Content-Length", String(obj.ContentLength));

    return new Response(obj.Body.transformToWebStream(), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo descargar" }, { status: 500 });
  }
}
