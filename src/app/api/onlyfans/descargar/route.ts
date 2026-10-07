import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { nombreDescarga, type ArchivoOF, type ColeccionOF } from "@/lib/onlyfans";
import { UUID } from "@/lib/ofServer";
import { urlDescarga } from "@/lib/r2/onlyfans";
import { alcanceActual, modeloProhibido, veModelo } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// GET /api/onlyfans/descargar?id=<archivo>  -> descarga el archivo EXACTO que subio la modelo (sin recomprimir), con un
// nombre ordenado (Rachel_Script1_F03_video.mov). Redirige a un enlace firmado de 1 h: el archivo baja directo del almacen.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const supabase = createAdminClient();
  const { data: a } = await supabase.from("of_archivos").select("*").eq("id", id).maybeSingle();
  if (!a) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  if (!veModelo(await alcanceActual(), a.modelo_id)) return modeloProhibido();
  const [{ data: col }, { data: modelo }] = await Promise.all([
    supabase.from("of_colecciones").select("tipo, nombre").eq("id", a.coleccion_id).maybeSingle(),
    supabase.from("modelos").select("nombre").eq("id", a.modelo_id).maybeSingle(),
  ]);

  const nombre = nombreDescarga(modelo?.nombre ?? "modelo", (col as Pick<ColeccionOF, "tipo" | "nombre"> | null) ?? { tipo: "pack", nombre: "contenido" }, a as ArchivoOF);
  const url = await urlDescarga(a.storage_key, nombre, a.bucket);
  if (!a.descargado_at) await supabase.from("of_archivos").update({ descargado_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.redirect(url);
}
