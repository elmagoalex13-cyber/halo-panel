import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verificarAdminSesion } from "@/lib/adminAuth";

const PUBLIC_PREFIXES = [
  "/login",
  "/m/",
  "/api/auth/",
  "/api/portal/",
  "/api/leads/public",
  "/api/landing-track",
  "/api/publer/programar",
  "/_next/",
];

function isPublic(pathname: string) {
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const ok = await verificarAdminSesion(req.cookies.get(ADMIN_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
