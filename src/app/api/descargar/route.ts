import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { keyBrutoAlternativas, keyEditado } from "@/lib/media";
import { getR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/descargar?id=<library_content.id>&tipo=editado|original
// Descarga el mp4 real desde R2 (solo keys que pertenecen a una pieza del panel).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const tipo = req.nextUrl.searchParams.get("tipo") === "original" ? "original" : "editado";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const supabase = createAdminClient();
  const { data: pieza, error } = await supabase
    .from("library_content")
    .select("id, titulo, r2_key, r2_key_original, video_procesado_url, modelos(nombre)")
    .eq("id", id)
    .single();
  if (error || !pieza) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });

  const keys = tipo === "original" ? keyBrutoAlternativas(pieza) : [keyEditado(pieza)].filter(Boolean) as string[];
  if (!keys.length) return NextResponse.json({ error: "La pieza no tiene video" }, { status: 404 });

  let lastError: unknown = null;
  for (const key of keys) {
  try {
    const obj = await getR2Object(key);
    if (!obj.Body) return NextResponse.json({ error: "Objeto vacio" }, { status: 404 });
    const ext = key.split(".").pop()?.toLowerCase() ?? "mp4";
    const base = (pieza.titulo || pieza.id).toString().replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const nombre = `${base}-${tipo}.${ext}`;
    const headers = new Headers({
      "Content-Type": obj.ContentType ?? "video/mp4",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    });
    if (obj.ContentLength) headers.set("Content-Length", String(obj.ContentLength));
    return new Response(obj.Body.transformToWebStream(), { headers });
  } catch (e) {
    lastError = e;
    if (tipo !== "original") break;
  }
  }

  return NextResponse.json({ error: lastError instanceof Error ? lastError.message : "No se pudo descargar" }, { status: 500 });
}
