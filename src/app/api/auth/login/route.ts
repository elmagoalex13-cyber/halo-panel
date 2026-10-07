import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_DAYS, adminAuthConfigured, crearAdminSesion, verificarCredenciales } from "@/lib/adminAuth";
import { verificarUsuarioPanel } from "@/lib/panelUsuarios";
import { acceso } from "@/lib/accesos";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "Login de admin no configurado" }, { status: 503 });
  }
  const usuario = String(body.username ?? "");
  const password = String(body.password ?? "");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";
  if (await acceso.bloqueado(usuario, ip)) {
    return NextResponse.json({ error: "Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar." }, { status: 429 });
  }
  let sesionDe: string | null = null;
  if (verificarCredenciales(usuario, password)) {
    sesionDe = usuario; // el dueño (variables de entorno)
  } else {
    const adicional = await verificarUsuarioPanel(usuario, password); // usuario adicional (tabla panel_usuarios)
    if (adicional) sesionDe = adicional.username;
  }
  if (!sesionDe) {
    await acceso.fallo(usuario, ip);
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  res.cookies.set(ADMIN_COOKIE, await crearAdminSesion(sesionDe), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: ADMIN_SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
