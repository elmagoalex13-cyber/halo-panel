import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { emailConfigurado } from "@/lib/resend";
import { CAMPOS_LISTA, emailValido, enlaceContrato, enviarEmailContrato, nuevoToken, type ContratoFila } from "@/lib/contratos";
import { CLAVE_FIRMA_AGENCIA } from "@/lib/contratoFirma";

export const dynamic = "force-dynamic";

const SIN_TABLA = "Falta ejecutar el SQL 20261024_contratos.sql en Supabase.";
const esFirmaPng = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/png;base64,") && v.length < 400_000;

// GET  -> contratos enviados (con su estado) y si Resend esta configurado
// POST { nombre, email, fecha_inicio, firma_agencia? } -> crea el contrato y lo envia por email a la modelo
export async function GET(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const db = createAdminClient();
  const { data, error } = await db.from("contratos").select(CAMPOS_LISTA).order("created_at", { ascending: false }).limit(100);
  if (error) {
    const falta = /contratos|relation|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? SIN_TABLA : error.message, sinTabla: falta, resend: emailConfigurado() }, { status: falta ? 409 : 500 });
  }
  const origen = req.nextUrl.origin;
  return NextResponse.json({
    resend: emailConfigurado(),
    contratos: ((data ?? []) as unknown as ContratoFila[]).map((c) => ({ ...c, enlace: enlaceContrato(origen, c.token) })),
  });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { nombre?: unknown; email?: unknown; fecha_inicio?: unknown; firma_agencia?: unknown };
  const nombre = typeof body.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const fecha = typeof body.fecha_inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha_inicio) ? body.fecha_inicio : "";
  if (nombre.length < 2) return NextResponse.json({ error: "Escribe el nombre de la modelo" }, { status: 400 });
  if (!emailValido(email)) return NextResponse.json({ error: "El email no es válido" }, { status: 400 });
  if (!fecha) return NextResponse.json({ error: "Elige la fecha de inicio" }, { status: 400 });

  const db = createAdminClient();
  let firma: string | null = esFirmaPng(body.firma_agencia) ? body.firma_agencia : null;
  if (!firma) {
    const { data } = await db.from("panel_config").select("value").eq("key", CLAVE_FIRMA_AGENCIA).maybeSingle();
    const guardada = (data?.value as { firma?: unknown } | undefined)?.firma;
    firma = esFirmaPng(guardada) ? guardada : null;
  }
  if (!firma) return NextResponse.json({ error: "Falta la firma de la agencia: dibújala una vez y queda guardada" }, { status: 400 });

  const token = nuevoToken();
  const { data: creado, error } = await db
    .from("contratos")
    .insert({ token, nombre, email, fecha_inicio: fecha, firma_agencia: firma, enviado_por: sesion.usuario })
    .select(CAMPOS_LISTA)
    .single();
  if (error || !creado) {
    const falta = /contratos|relation|schema cache/i.test(error?.message ?? "");
    return NextResponse.json({ error: falta ? SIN_TABLA : (error?.message ?? "No se pudo crear el contrato") }, { status: falta ? 409 : 500 });
  }

  const enlace = enlaceContrato(req.nextUrl.origin, token);
  const envio = await enviarEmailContrato({ nombre, email, fecha_inicio: fecha }, enlace);
  const ahora = new Date().toISOString();
  await db.from("contratos").update(envio.ok ? { enviado_at: ahora, email_error: null } : { email_error: envio.error.slice(0, 300) }).eq("id", creado.id);

  return NextResponse.json({ ok: true, enlace, email: envio.ok ? { enviado: true } : { enviado: false, error: envio.error, sinConfigurar: Boolean(envio.sinConfigurar) } });
}
