import { NextResponse } from "next/server";
import { COOKIE_PORTAL } from "@/lib/portalAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PORTAL, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
