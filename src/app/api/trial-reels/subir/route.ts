import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { canUseSupabase } from "@/lib/supabase/server";
import { alcanceActual, veModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { borrarDeR2, listarClavesR2 } from "@/lib/r2";
import { CODIGO_SUBIDA, MAX_BYTES_ORIGINAL, TROZO_BYTES, anadirSubida, cuentaVisible, extensionVideo, leerSubidas, quitarSubida, type SubidaTrial } from "@/lib/trialSubidas";

export const dynamic = "force-dynamic";

// GET -> subidas pendientes o con error que puede ver quien mira (la pantalla las enseña mientras el editor prepara el original)
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ subidas: [] });
  const alcance = await alcanceActual();
  return NextResponse.json({ subidas: (await leerSubidas()).filter((s) => veModelo(alcance, s.modelo_id)) });
}

// POST { accion: "iniciar", cuenta_id, nombre, size, tipo } -> { codigo, trozo }   (reserva el codigo de la subida)
// POST { accion: "terminar", cuenta_id, codigo, partes, size, nombre, tipo, descripcion?, cantidad?, generar? } -> apunta la subida para que el editor la prepare
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { accion?: string; cuenta_id?: string; nombre?: string; size?: number; tipo?: string; codigo?: string; partes?: number; descripcion?: string; cantidad?: number; generar?: boolean } | null;
  const cuenta = await cuentaVisible(String(b?.cuenta_id ?? ""));
  if (!cuenta) return NextResponse.json({ error: "Elige una cuenta de Instagram válida" }, { status: 400 });
  const size = Number(b?.size);
  const tipo = String(b?.tipo ?? "");
  const nombre = String(b?.nombre ?? "video").slice(0, 160);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
  if (size > MAX_BYTES_ORIGINAL) return NextResponse.json({ error: "El vídeo pesa demasiado (máximo 1,5 GB)" }, { status: 413 });
  if (!(tipo.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(nombre))) return NextResponse.json({ error: "Eso no parece un vídeo" }, { status: 415 });

  if (b?.accion === "iniciar") {
    return NextResponse.json({ codigo: `sub-${randomBytes(6).toString("hex").slice(0, 10)}`, trozo: TROZO_BYTES });
  }

  if (b?.accion === "terminar") {
    const codigo = String(b.codigo ?? "");
    const partes = Number(b.partes);
    if (!CODIGO_SUBIDA.test(codigo) || !Number.isInteger(partes) || partes < 1 || partes !== Math.ceil(size / TROZO_BYTES)) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
    // Todos los trozos tienen que estar ya en el almacen
    const claves = await listarClavesR2(`subidas-trial/${codigo}/`, partes + 5).catch(() => []);
    if (claves.length !== partes) return NextResponse.json({ error: `Faltan trozos del vídeo (${claves.length} de ${partes}). Vuelve a subirlo.` }, { status: 409 });
    const subida: SubidaTrial = {
      codigo,
      cuenta_id: cuenta.id,
      modelo_id: cuenta.modelo_id,
      usuario: cuenta.usuario,
      partes,
      size,
      ext: extensionVideo(nombre, tipo),
      nombre,
      descripcion: String(b.descripcion ?? "").trim().slice(0, 300),
      cantidad: Math.min(3, Math.max(1, Math.round(Number(b.cantidad)) || 3)),
      generar: b.generar !== false,
      por: sesion.nombre || sesion.usuario,
      at: new Date().toISOString(),
      estado: "pendiente",
    };
    if (!(await anadirSubida(subida))) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

// DELETE ?codigo=<codigo> -> quita una subida con error (y sus trozos)
export async function DELETE(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const codigo = req.nextUrl.searchParams.get("codigo") ?? "";
  if (!CODIGO_SUBIDA.test(codigo)) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const alcance = await alcanceActual();
  const s = (await leerSubidas()).find((x) => x.codigo === codigo);
  if (!s || !veModelo(alcance, s.modelo_id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  await quitarSubida(codigo);
  for (const k of await listarClavesR2(`subidas-trial/${codigo}/`, 1000).catch(() => [])) await borrarDeR2(k).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
