import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { COOKIE_PORTAL, crearSesion, verificarLogin } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const { slug, usuario, password } = (await req.json().catch(() => ({}))) as { slug?: string; usuario?: string; password?: string };
  if (!slug || !usuario || !password) return NextResponse.json({ error: "Usuario y contrasena requeridos" }, { status: 400 });

  const modelo = await verificarLogin(slug, usuario, password);
  if (!modelo) return NextResponse.json({ error: "Usuario o contrasena incorrectos" }, { status: 401 });

  const sesion = crearSesion(modelo.id, slug);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PORTAL, sesion.valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sesion.maxAge,
  });
  return res;
}
