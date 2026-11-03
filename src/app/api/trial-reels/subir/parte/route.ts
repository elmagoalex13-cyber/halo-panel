import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { uploadToR2 } from "@/lib/r2";
import { CODIGO_SUBIDA, TROZO_BYTES, claveTrozo, cuentaVisible } from "@/lib/trialSubidas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST ?cuenta=<id>&codigo=<codigo>&n=<numero de trozo, desde 1>   cuerpo = el trozo (hasta 4 MB)
// Se puede repetir el mismo trozo: se sobrescribe, asi que reintentar es seguro.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const codigo = req.nextUrl.searchParams.get("codigo") ?? "";
  const n = Number(req.nextUrl.searchParams.get("n"));
  if (!CODIGO_SUBIDA.test(codigo) || !Number.isInteger(n) || n < 1 || n > 500) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (!(await cuentaVisible(req.nextUrl.searchParams.get("cuenta") ?? ""))) return NextResponse.json({ error: "Cuenta no válida" }, { status: 400 });
  const cuerpo = Buffer.from(await req.arrayBuffer());
  if (!cuerpo.length || cuerpo.length > TROZO_BYTES + 1024) return NextResponse.json({ error: "Trozo no válido" }, { status: 400 });
  try {
    await uploadToR2(claveTrozo(codigo, n), cuerpo, "application/octet-stream");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el trozo" }, { status: 500 });
  }
}
