import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { accesosCompletos, guardarAccesosModelo, validarAccesos } from "@/lib/accesosModelo";
import { encolarTelegram } from "@/lib/telegramCola";

export const dynamic = "force-dynamic";

// La modelo ve SOLO si ya los dio (nunca vuelven al navegador); los guarda cifrados en el Vault de la agencia.
export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  return NextResponse.json({ completo: await accesosCompletos(sesion.modeloId) });
}

export async function PUT(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const { datos, error } = validarAccesos(await req.json().catch(() => null));
  if (!datos) return NextResponse.json({ error }, { status: 400 });

  const db = createAdminClient();
  const { data: modelo } = await db.from("modelos").select("nombre, ambito").eq("id", sesion.modeloId).maybeSingle();
  if (!modelo) return NextResponse.json({ error: "Modelo no encontrada" }, { status: 404 });

  const eraCompleto = await accesosCompletos(sesion.modeloId);
  try {
    await guardarAccesosModelo(sesion.modeloId, String(modelo.nombre), modelo.ambito === "compartido" ? "compartido" : "privado", datos);
  } catch {
    return NextResponse.json({ error: "No se pudieron guardar tus accesos. Inténtalo de nuevo en un momento." }, { status: 500 });
  }
  await encolarTelegram("accesos", sesion.modeloId, { actualizacion: eraCompleto });
  return NextResponse.json({ ok: true });
}
