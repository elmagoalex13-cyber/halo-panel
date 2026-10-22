import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { enlaceContrato, enviarEmailContrato } from "@/lib/contratos";
import { varianteDe } from "@/lib/contratoVariantesDb";
import { puedeVerContratoId } from "@/lib/contratoAmbito";

export const dynamic = "force-dynamic";

// POST { accion: "reenviar" | "cancelar" | "vincular" | "nota", modelo_id?, nota? } sobre un contrato ya creado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  if (!(await puedeVerContratoId(id))) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  const { accion, modelo_id, nota } = (await req.json().catch(() => ({}))) as { accion?: string; modelo_id?: string | null; nota?: unknown };
  const db = createAdminClient();
  const { data: c } = await db.from("contratos_modelos").select("id, token, nombre, email, fecha_inicio, estado").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

  if (accion === "nota") {
    // Nota interna para clasificar los contratos entre los dos (no la ve la modelo)
    const texto = typeof nota === "string" ? nota.trim().slice(0, 500) : "";
    const { error } = await db.from("contratos_modelos").update({ nota_interna: texto || null }).eq("id", id);
    if (error) return NextResponse.json({ error: /nota_interna/i.test(error.message) ? "Falta ejecutar el SQL 20261027_contratos_nota.sql en Supabase." : error.message }, { status: /nota_interna/i.test(error.message) ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }
  if (accion === "vincular") {
    // Liga el contrato a una modelo (o lo desliga con modelo_id null): asi aparece en su ficha
    let destino: string | null = null;
    if (modelo_id) {
      const { data: m } = await db.from("modelos").select("id").eq("id", modelo_id).maybeSingle();
      if (!m) return NextResponse.json({ error: "Modelo no encontrada" }, { status: 404 });
      destino = m.id as string;
    }
    const { error } = await db.from("contratos_modelos").update({ modelo_id: destino }).eq("id", id);
    if (error) return NextResponse.json({ error: /modelo_id/i.test(error.message) ? "Falta ejecutar el SQL 20261026_contratos_modelo_id.sql en Supabase." : error.message }, { status: /modelo_id/i.test(error.message) ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }
  if (accion === "cancelar") {
    // Cancelar un contrato = eliminarlo (el enlace deja de funcionar y no queda en la lista). Los firmados no se tocan.
    if (c.estado === "firmado") return NextResponse.json({ error: "Ya está firmado: no se puede eliminar" }, { status: 409 });
    const { error } = await db.from("contratos_modelos").delete().eq("id", id).neq("estado", "firmado");
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (accion === "reenviar") {
    if (c.estado === "firmado" || c.estado === "cancelado") return NextResponse.json({ error: c.estado === "firmado" ? "Ya está firmado" : "Está cancelado" }, { status: 409 });
    const envio = await enviarEmailContrato({ nombre: c.nombre as string, email: c.email as string, fecha_inicio: c.fecha_inicio as string }, enlaceContrato(req.nextUrl.origin, c.token as string), await varianteDe(c.token as string));
    await db.from("contratos_modelos").update(envio.ok ? { enviado_at: new Date().toISOString(), email_error: null } : { email_error: envio.error.slice(0, 300) }).eq("id", id);
    return envio.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: envio.error }, { status: envio.sinConfigurar ? 409 : 502 });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

// DELETE: elimina un contrato que no esta firmado (se borra del todo; su enlace deja de funcionar). Los firmados se conservan como prueba.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  if (!(await puedeVerContratoId(id))) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  const db = createAdminClient();
  const { data: c } = await db.from("contratos_modelos").select("id, estado").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ ok: true }); // ya no esta
  if (c.estado === "firmado") return NextResponse.json({ error: "Un contrato firmado no se puede eliminar" }, { status: 409 });
  const { error } = await db.from("contratos_modelos").delete().eq("id", id).neq("estado", "firmado");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
