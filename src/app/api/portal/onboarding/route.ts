import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { sanearDatos, validarOnboarding, type DatosOnboarding } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

function canonico(d: DatosOnboarding) {
  return JSON.stringify(d, Object.keys(d).sort());
}

export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const { data, error } = await createAdminClient()
    .from("modelo_onboarding")
    .select("datos, estado, enviado_at, updated_at")
    .eq("modelo_id", sesion.modeloId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ datos: data?.datos ?? {}, estado: data?.estado ?? "borrador", enviado_at: data?.enviado_at ?? null });
}

// Guarda el borrador (siempre, aunque este incompleto) o lo envia (enviar:true, validando).
// Cada cambio deja una copia en modelo_onboarding_historial (inmutable).
export async function PUT(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { datos?: unknown; enviar?: boolean } | null;
  if (!body || typeof body.datos !== "object" || body.datos === null) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const nuevos = sanearDatos(body.datos);
  const enviar = body.enviar === true;
  if (enviar) {
    const errores = validarOnboarding(nuevos);
    if (Object.keys(errores).length) return NextResponse.json({ error: "Faltan campos obligatorios", errores }, { status: 422 });
  }

  const supabase = createAdminClient();
  const { data: actual, error: errLeer } = await supabase
    .from("modelo_onboarding")
    .select("datos, estado")
    .eq("modelo_id", sesion.modeloId)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: errLeer.message }, { status: 500 });

  const previos = sanearDatos(actual?.datos ?? {});
  const cambio = canonico(previos) !== canonico(nuevos);
  const ahora = new Date().toISOString();

  // Historial PRIMERO: si algo falla despues, la copia ya esta a salvo.
  if (cambio || enviar) {
    const { error: errHist } = await supabase
      .from("modelo_onboarding_historial")
      .insert({ modelo_id: sesion.modeloId, datos: nuevos, origen: enviar ? "enviado" : "autoguardado" });
    if (errHist) return NextResponse.json({ error: errHist.message }, { status: 500 });
  }

  const estado = enviar ? "enviado" : (actual?.estado ?? "borrador");
  const fila = {
    modelo_id: sesion.modeloId,
    datos: nuevos,
    estado,
    ...(enviar ? { enviado_at: ahora } : {}),
    updated_at: ahora,
  };
  const { error } = actual
    ? await supabase.from("modelo_onboarding").update(fila).eq("modelo_id", sesion.modeloId)
    : await supabase.from("modelo_onboarding").insert(fila);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, estado, guardado_at: ahora });
}
