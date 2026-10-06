import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { slotDe } from "@/lib/onlyfans";
import { TAM_MAXIMO, UUID, coleccionDeModelo, extensionSegura, tipoDeArchivo } from "@/lib/ofServer";
import { prepararSubida } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

// Prepara la subida directa a R2 (URL firmada o por partes). El archivo va tal cual: sin pasar por el servidor ni recomprimirse.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    coleccion_id?: string; filename?: string; contentType?: string; size?: number; fase?: number; slot?: string;
  } | null;
  if (!body?.coleccion_id || !UUID.test(body.coleccion_id)) return NextResponse.json({ error: "Falta la colección" }, { status: 400 });
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > TAM_MAXIMO) return NextResponse.json({ error: "Tamaño de archivo no válido" }, { status: 400 });
  const tipo = tipoDeArchivo(body.contentType, body.filename);
  if (!tipo) return NextResponse.json({ error: "Solo se pueden subir fotos y vídeos" }, { status: 415 });

  const supabase = createAdminClient();
  const col = await coleccionDeModelo(supabase, body.coleccion_id, sesion.modeloId);
  if (!col) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  if (col.estado === "entregado") return NextResponse.json({ error: "Ya la marcaste como entregada. Pídele a tu agencia que la reabra." }, { status: 409 });

  if (col.tipo === "script") {
    const slot = slotDe(Number(body.fase), String(body.slot));
    if (!slot) return NextResponse.json({ error: "Hueco no válido" }, { status: 400 });
    if (slot.tipo !== tipo) return NextResponse.json({ error: slot.tipo === "video" ? "Aquí va un vídeo" : "Aquí van fotos" }, { status: 415 });
  }

  const contentType = body.contentType || (tipo === "video" ? "video/mp4" : "image/jpeg");
  const key = `onlyfans/${sesion.modeloId}/${col.id}/${randomUUID()}.${extensionSegura(body.filename, tipo)}`;
  try {
    return NextResponse.json({ key, ...(await prepararSubida(key, contentType, size)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo preparar la subida" }, { status: 500 });
  }
}
