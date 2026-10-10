import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { enlaceContrato, enviarEmailContrato } from "@/lib/contratos";

export const dynamic = "force-dynamic";

// POST { accion: "reenviar" | "cancelar" } sobre un contrato ya creado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const { accion } = (await req.json().catch(() => ({}))) as { accion?: string };
  const db = createAdminClient();
  const { data: c } = await db.from("contratos_modelos").select("id, token, nombre, email, fecha_inicio, estado").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

  if (accion === "cancelar") {
    // Cancelar un contrato = eliminarlo (el enlace deja de funcionar y no queda en la lista). Los firmados no se tocan.
    if (c.estado === "firmado") return NextResponse.json({ error: "Ya está firmado: no se puede eliminar" }, { status: 409 });
    const { error } = await db.from("contratos_modelos").delete().eq("id", id).neq("estado", "firmado");
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (accion === "reenviar") {
    if (c.estado === "firmado" || c.estado === "cancelado") return NextResponse.json({ error: c.estado === "firmado" ? "Ya está firmado" : "Está cancelado" }, { status: 409 });
    const envio = await enviarEmailContrato({ nombre: c.nombre as string, email: c.email as string, fecha_inicio: c.fecha_inicio as string }, enlaceContrato(req.nextUrl.origin, c.token as string));
    await db.from("contratos_modelos").update(envio.ok ? { enviado_at: new Date().toISOString(), email_error: null } : { email_error: envio.error.slice(0, 300) }).eq("id", id);
    return envio.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: envio.error }, { status: envio.sinConfigurar ? 409 : 502 });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

// DELETE: elimina un contrato que no esta firmado (se borra del todo; su enlace deja de funcionar). Los firmados se conservan como prueba.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const db = createAdminClient();
  const { data: c } = await db.from("contratos_modelos").select("id, estado").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ ok: true }); // ya no esta
  if (c.estado === "firmado") return NextResponse.json({ error: "Un contrato firmado no se puede eliminar" }, { status: 409 });
  const { error } = await db.from("contratos_modelos").delete().eq("id", id).neq("estado", "firmado");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
