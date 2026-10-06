import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColeccionOF } from "@/lib/onlyfans";

const EXT_VIDEO = new Set(["mov", "mp4", "m4v", "avi", "mkv", "webm", "mpg", "mpeg", "3gp"]);
const EXT_FOTO = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp", "tif", "tiff", "dng", "raw"]);

/** video | foto según el tipo MIME o, si el navegador no lo da (pasa con .HEIC/.MOV), la extensión. */
export function tipoDeArchivo(mime: string | null | undefined, nombre: string | null | undefined): "video" | "foto" | null {
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("image/")) return "foto";
  const ext = nombre?.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_VIDEO.has(ext)) return "video";
  if (EXT_FOTO.has(ext)) return "foto";
  return null;
}

export function extensionSegura(nombre: string | null | undefined, tipo: "video" | "foto") {
  const ext = (nombre?.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  return ext || (tipo === "video" ? "mp4" : "jpg");
}

/** Coleccion de la modelo con sesion (null si no existe o es de otra modelo). */
export async function coleccionDeModelo(supabase: SupabaseClient, coleccionId: string, modeloId: string): Promise<ColeccionOF | null> {
  const { data } = await supabase.from("of_colecciones").select("*").eq("id", coleccionId).eq("modelo_id", modeloId).maybeSingle();
  return (data as ColeccionOF | null) ?? null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TAM_MAXIMO = 8 * 1024 ** 3; // 8 GB por archivo
