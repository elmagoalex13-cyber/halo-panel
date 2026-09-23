import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_DAYS, adminAuthConfigured, crearAdminSesion, verificarCredenciales } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "Login de admin no configurado" }, { status: 503 });
  }
  if (!verificarCredenciales(String(body.username ?? ""), String(body.password ?? ""))) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  res.cookies.set(ADMIN_COOKIE, await crearAdminSesion(String(body.username)), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: ADMIN_SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
