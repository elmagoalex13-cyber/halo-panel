import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { LeadEstado } from "@/types";

const ESTADOS = new Set<LeadEstado>(["nuevo", "contactado", "captado", "futuro", "descartado", "eliminado"]);

type Body = {
  estado?: unknown;
  notas?: unknown;
  seguimiento_at?: unknown;
  eliminar_datos?: unknown;
};

function asString(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Body;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    const estado = asString(body.estado, 40) as LeadEstado | null;

    if (estado) {
      if (!ESTADOS.has(estado)) return NextResponse.json({ error: "Estado no valido" }, { status: 400 });
      update.estado = estado;
      if (estado === "contactado") update.ultimo_contacto_at = now;
      if (estado === "captado") update.captado_at = now;
      if (estado === "descartado") update.descartado_at = now;
    }

    if (typeof body.notas === "string") update.notas = body.notas.trim() || null;
    if (typeof body.seguimiento_at === "string") update.seguimiento_at = body.seguimiento_at || null;

    if (body.eliminar_datos === true) {
      Object.assign(update, {
        estado: "eliminado",
        nombre: null,
        email: null,
        whatsapp: null,
        instagram: null,
        pais: null,
        otro_mensaje: null,
        adjuntos: [],
        notas: null,
        eliminado_at: now,
      });
    }

    const { error } = await createAdminClient().from("leads").update(update).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
