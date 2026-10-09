import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, veModelo } from "@/lib/alcance";
import { COOKIE_PORTAL, crearSesion } from "@/lib/portalAuth";
import { modeloEliminada } from "@/lib/papelera";

export const dynamic = "force-dynamic";

const HORAS_ADMIN = 8;

// Entrar al portal de una modelo SIN contraseña, solo para quien esta dentro del panel (la ruta esta protegida por el
// middleware). Quien no pueda ver a esa modelo (el socio con las privadas del dueño) no entra. La sesion dura 8 horas.
// Si algo falla, se vuelve al panel en vez de enseñar un error en crudo.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const volver = (motivo: string) => {
    const url = new URL("/dashboard", req.url);
    url.searchParams.set("aviso", motivo);
    return NextResponse.redirect(url);
  };
  if (!canUseSupabase()) return volver("portal-no-disponible");
  const { id } = await params;

  const alcance = await alcanceActual();
  if (!veModelo(alcance, id)) return volver("sin-acceso");

  const { data: modelo } = await createAdminClient().from("modelos").select("id, portal_token, activa").eq("id", id).maybeSingle();
  if (!modelo?.portal_token || !modelo.activa || (await modeloEliminada(id))) return volver("portal-no-disponible");

  const slug = modelo.portal_token as string;
  const sesion = crearSesion(id, slug, HORAS_ADMIN);
  const res = NextResponse.redirect(new URL(`/m/${slug}`, req.url));
  res.cookies.set(COOKIE_PORTAL, sesion.valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sesion.maxAge,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
