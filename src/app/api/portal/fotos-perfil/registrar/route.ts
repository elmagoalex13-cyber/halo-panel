import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/portalAuth";
import { esTipoFotoPerfil, guardarFotoPerfil, prefijoFotosPerfil } from "@/lib/fotosPerfil";
import { tamanoEnR2, urlVista } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

// Registra la foto de perfil/banner ya subida a R2 (comprueba que existe, que es de esta modelo y que llego completa). Sustituye a la anterior.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada, vuelve a entrar" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { tipo?: unknown; key?: string; nombre?: string; size?: number; mime?: string } | null;
  if (!b || !esTipoFotoPerfil(b.tipo) || !b.key) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (!b.key.startsWith(`${prefijoFotosPerfil(sesion.modeloId)}${b.tipo}-`) || b.key.includes("..")) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  const real = await tamanoEnR2(b.key);
  if (real === null) return NextResponse.json({ error: "La foto no llegó completa. Vuelve a subirla." }, { status: 404 });
  if (b.size && real !== Number(b.size)) return NextResponse.json({ error: "La foto llegó incompleta. Vuelve a subirla." }, { status: 409 });
  const ok = await guardarFotoPerfil(sesion.modeloId, b.tipo, { key: b.key, nombre: (b.nombre ?? "foto").slice(0, 150), size: real, mime: (b.mime ?? "").slice(0, 100) || null, at: new Date().toISOString() });
  if (!ok) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
  return NextResponse.json({ ok: true, vista: await urlVista(b.key).catch(() => null) });
}
