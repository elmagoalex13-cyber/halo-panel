import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sesionActual } from "@/lib/portalAuth";
import { EXT_FOTO_PERFIL, esTipoFotoPerfil, prefijoFotosPerfil } from "@/lib/fotosPerfil";
import { prepararSubida } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

const TAM_MAX = 40 * 1024 * 1024; // una foto, aunque sea enorme, no pasa de aqui (se sube de una vez)

// Prepara la subida directa a R2 de la foto de perfil o del banner (el archivo va tal cual, sin recomprimir).
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada, vuelve a entrar" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { tipo?: unknown; filename?: string; contentType?: string; size?: number } | null;
  if (!b || !esTipoFotoPerfil(b.tipo)) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0 || size > TAM_MAX) return NextResponse.json({ error: "La foto es demasiado grande" }, { status: 400 });
  const ext = (b.filename?.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!EXT_FOTO_PERFIL.has(ext) || (b.contentType && !b.contentType.startsWith("image/"))) return NextResponse.json({ error: "Sube una foto (JPG, PNG o similar)" }, { status: 415 });
  const contentType = b.contentType || "image/jpeg";
  const key = `${prefijoFotosPerfil(sesion.modeloId)}${b.tipo}-${randomUUID()}.${ext}`;
  try {
    const pre = await prepararSubida(key, contentType, size);
    if (pre.modo !== "single") return NextResponse.json({ error: "La foto es demasiado grande" }, { status: 400 });
    return NextResponse.json({ key, url: pre.url, contentType: pre.contentType });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo preparar la subida" }, { status: 500 });
  }
}
