import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, esDueno, leerAdminSesion } from "@/lib/adminAuth";
import { areaDePath, esSoloDueno } from "@/lib/areas";
import { permisosDe } from "@/lib/permisosEdge";
import { clasificarActividad, registrarActividad } from "@/lib/actividadEdge";

const PUBLIC_PREFIXES = [
  "/login",
  "/m/",
  "/api/auth/",
  "/api/portal/",
  "/contrato/", // la modelo firma su contrato desde el enlace del email (el token es el secreto)
  "/api/contrato/",
  "/api/leads/public",
  "/api/landing-track",
  "/api/publer/programar",
  "/api/mantenimiento/", // limpieza automatica (cron de Vercel, con CRON_SECRET)
  "/_next/",
];

function isPublic(pathname: string) {
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const esApi = pathname.startsWith("/api/");
  const sesion = await leerAdminSesion(req.cookies.get(ADMIN_COOKIE)?.value);

  if (!sesion) {
    if (esApi) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // El dueño (variables de entorno) lo ve todo
  if (esDueno(sesion.u)) return NextResponse.next();

  // Usuario adicional: tiene que seguir existiendo y activo, y no puede entrar en las secciones que se le han ocultado
  const permisos = await permisosDe(sesion.u);
  const denegar = (estado: number, mensaje: string) => {
    if (esApi) return NextResponse.json({ error: mensaje }, { status: estado });
    const url = req.nextUrl.clone();
    url.pathname = estado === 401 ? "/login" : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  };
  if (permisos === "error") return denegar(503, "No se pudo comprobar el acceso");
  if (!permisos || !permisos.activo) return denegar(401, "Acceso desactivado");
  if (esSoloDueno(pathname)) return denegar(403, "Solo el dueño del panel puede hacer esto");
  const area = areaDePath(pathname);
  if (area && permisos.denegadas.includes(area)) return denegar(403, "No tienes acceso a esta sección");

  // Lo que hace un usuario que no es el dueño queda anotado en el registro de actividad (sin retrasar la respuesta)
  const actividad = esApi ? clasificarActividad(req.method, pathname, req.nextUrl.searchParams) : null;
  if (actividad) event.waitUntil(registrarActividad(sesion.u, actividad, req.method, pathname));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
