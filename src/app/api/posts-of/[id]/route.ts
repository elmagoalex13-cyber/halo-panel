import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { cargarBanco, elegirCaption } from "@/lib/postsCaptionBanco";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fila(id: string) {
  const db = createAdminClient();
  const { data } = await db.from("posts_programados").select("id, modelo_id, archivo_id, estado, caption, programar_para").eq("id", id).maybeSingle();
  return { db, p: data };
}

// PATCH { caption?, programar_para?, estado?: "borrador" | "aprobado" | "descartado" }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const { db, p } = await fila(id);
  if (!p) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const g = await exigirModelo(p.modelo_id as string);
  if (g) return g;
  if (p.estado === "programado" || p.estado === "publicado") return NextResponse.json({ error: "Ya está en la cola de Venuz: no se puede cambiar desde aquí" }, { status: 409 });

  const b = (await req.json().catch(() => ({}))) as { caption?: unknown; programar_para?: unknown; estado?: unknown };
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.caption === "string") {
    cambios.caption = b.caption.trim().slice(0, 1500) || null;
    if (cambios.caption) cambios.caption_motivo = null;
  }
  if (typeof b.programar_para === "string") {
    const d = new Date(b.programar_para);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
    cambios.programar_para = d.toISOString();
  }
  if (b.estado === "borrador" || b.estado === "descartado") cambios.estado = b.estado;
  if (b.estado === "aprobado") {
    const caption = (cambios.caption as string | null | undefined) ?? (p.caption as string | null);
    const cuando = new Date((cambios.programar_para as string | undefined) ?? (p.programar_para as string | null) ?? "");
    if (!caption) return NextResponse.json({ error: "Escribe el caption antes de aprobar" }, { status: 400 });
    if (Number.isNaN(cuando.getTime()) || cuando.getTime() < Date.now() + 10 * 60000) return NextResponse.json({ error: "La fecha tiene que ser futura" }, { status: 400 });
    const sesion = await sesionPanelActual();
    Object.assign(cambios, { estado: "aprobado", aprobado_por: sesion?.usuario ?? null, aprobado_at: new Date().toISOString(), error: null });
  }
  const { error } = await db.from("posts_programados").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST { accion: "regenerar" } -> otro caption del banco para esa foto
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const { accion } = (await req.json().catch(() => ({}))) as { accion?: string };
  if (accion !== "regenerar") return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  const { db, p } = await fila(id);
  if (!p) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const g = await exigirModelo(p.modelo_id as string);
  if (g) return g;
  if (p.estado === "programado" || p.estado === "publicado") return NextResponse.json({ error: "Ya está en la cola de Venuz" }, { status: 409 });

  const ctx = await cargarBanco(db, p.modelo_id as string);
  if (!ctx) return NextResponse.json({ error: "El banco de captions está vacío: importa los captions en la página Captions." }, { status: 409 });
  const caption = elegirCaption(ctx, p.caption ? [p.caption as string] : []);
  if (!caption) return NextResponse.json({ error: "Esta modelo ya ha usado todos los captions del banco" }, { status: 409 });
  await db.from("posts_programados").update({ caption, caption_motivo: null, estado: "borrador", updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, caption });
}
