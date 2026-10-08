import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Version desplegada (commit de Git). Publico y sin datos sensibles: sirve para comprobar que un despliegue de Vercel ya esta en produccion.
export async function GET() {
  return NextResponse.json({ commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7), region: process.env.VERCEL_REGION ?? null });
}
