import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { keyBrutoAlternativas, keyEditado } from "@/lib/media";
import { existeEnR2, getSignedDownloadUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

// GET /api/descargar?id=<library_content.id>&tipo=editado|original
// Descarga el video de una pieza del panel. Redirige a una URL firmada (caduca en 1 h) para que el
// archivo baje directo del almacen, sin pasar por el servidor (los originales pesan hasta cientos de MB).
// Los originales de las modelos pueden estar en R2 ("bruto/...") o en el bucket privado de Supabase
// ("supabase://portal-uploads/...", los de menos de 50 MB): se aceptan los dos.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const tipo = req.nextUrl.searchParams.get("tipo") === "original" ? "original" : "editado";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const supabase = createAdminClient();
  const { data: pieza, error } = await supabase
    .from("library_content")
    .select("id, titulo, filename_original, r2_key, r2_key_original, video_procesado_url, modelos(nombre)")
    .eq("id", id)
    .single();
  if (error || !pieza) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });

  const keys = tipo === "original" ? keyBrutoAlternativas(pieza) : [keyEditado(pieza)].filter(Boolean) as string[];
  if (!keys.length) return NextResponse.json({ error: "La pieza no tiene video" }, { status: 404 });

  const modelo = (pieza.modelos as { nombre?: string } | { nombre?: string }[] | null);
  const nombreModelo = (Array.isArray(modelo) ? modelo[0]?.nombre : modelo?.nombre) ?? "";
  const limpiar = (t: string) => t.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

  for (const key of keys) {
    const ext = key.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    // Los originales conservan el nombre con el que los grabo la modelo (IMG_8027.MOV).
    const base = tipo === "original" && pieza.filename_original
      ? limpiar(pieza.filename_original).replace(/\.[^.]+$/, "")
      : limpiar((pieza.titulo || pieza.id).toString());
    const nombre = `${nombreModelo ? `${limpiar(nombreModelo)}-` : ""}${base}-${tipo}.${ext}`;

    if (key.startsWith("supabase://")) {
      const sinEsquema = key.slice("supabase://".length);
      const barra = sinEsquema.indexOf("/");
      if (barra === -1) continue;
      const { data: firmada } = await supabase.storage
        .from(sinEsquema.slice(0, barra))
        .createSignedUrl(sinEsquema.slice(barra + 1), 3600, { download: nombre });
      if (firmada?.signedUrl) return NextResponse.redirect(firmada.signedUrl);
      continue;
    }

    if (await existeEnR2(key)) {
      return NextResponse.redirect(await getSignedDownloadUrl(key, undefined, nombre));
    }
  }

  return NextResponse.json({ error: "No se encontró el archivo en el almacén" }, { status: 404 });
}
