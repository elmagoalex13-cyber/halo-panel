import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { exigirModelo } from "@/lib/alcance";
import { claveMiniatura } from "@/lib/ofMiniaturas";
import { prefijoHistorias } from "@/lib/historiasIG";
import { abrirObjetoOF, subirObjetoOF } from "@/lib/r2/onlyfans";
import { UUID } from "@/lib/ofServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Las fotos de historias vistas desde el panel pasan por aqui en vez de ir directas a R2 (hay redes desde las que R2 no responde y el panel se quedaba colgado
// esperando 300 fotos originales de varios MB). GET ?modelo=<id>&key=<clave>&modo=mini|full|descarga
//  mini     -> copia pequena (JPEG ~360 px, unas decenas de KB): se crea la primera vez y se guarda junto a la original (<clave>.thumb.jpg)
//  full     -> la foto original (para el visor grande)
//  descarga -> la original como archivo descargable
const CACHE = "private, max-age=86400";

function cabeceras(tipo: string, extra: Record<string, string> = {}) {
  return { "Content-Type": tipo, "Cache-Control": CACHE, ...extra };
}

export async function GET(req: NextRequest) {
  const modeloId = req.nextUrl.searchParams.get("modelo") ?? "";
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const modo = req.nextUrl.searchParams.get("modo") ?? "mini";
  if (!UUID.test(modeloId)) return NextResponse.json({ error: "Modelo no válida" }, { status: 400 });
  const g = await exigirModelo(modeloId);
  if (g) return g;
  if (!key.startsWith(prefijoHistorias(modeloId)) || key.includes("..") || key.endsWith(".thumb.jpg")) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });

  try {
    if (modo === "mini") {
      // La miniatura ya hecha
      const hecha = await abrirObjetoOF(claveMiniatura(key)).catch(() => null);
      if (hecha?.Body) return new Response(hecha.Body.transformToWebStream(), { headers: cabeceras("image/jpeg") });
      // Primera vez: se crea a partir de la original
      const original = await abrirObjetoOF(key);
      if (!original.Body) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
      const bytes = Buffer.from(await original.Body.transformToByteArray());
      const mini = await sharp(bytes, { failOn: "none", limitInputPixels: 120_000_000 }).rotate().resize({ width: 360, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
      await subirObjetoOF(claveMiniatura(key), mini, "image/jpeg").catch(() => undefined); // si no se puede guardar, se sirve igual
      return new Response(new Uint8Array(mini), { headers: cabeceras("image/jpeg") });
    }
    const o = await abrirObjetoOF(key);
    if (!o.Body) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
    const nombre = (key.split("/").pop() ?? "historia.jpg").replace(/"/g, "");
    return new Response(o.Body.transformToWebStream(), {
      headers: cabeceras(o.ContentType ?? "application/octet-stream", modo === "descarga" ? { "Content-Disposition": `attachment; filename="${nombre}"` } : {}),
    });
  } catch (e) {
    const noExiste = e instanceof Error && /NoSuchKey|not found|404/i.test(`${e.name} ${e.message}`);
    return NextResponse.json({ error: noExiste ? "No se encontró" : "No se pudo cargar la foto" }, { status: noExiste ? 404 : 500 });
  }
}
