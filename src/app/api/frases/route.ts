import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { SIN_CANCION } from "@/lib/frases";

export const dynamic = "force-dynamic";

type Cuerpo = {
  id?: string;
  frase?: string;
  cancion_nombre?: string;
  cancion_artista?: string | null;
  audio_id_ig?: string | null;
  puntuacion?: number;
  activa?: boolean;
  layout_json?: unknown | null;
};

function limpiar(b: Cuerpo) {
  const fila: Record<string, unknown> = {};
  if (b.frase !== undefined) fila.frase = b.frase.trim();
  if (b.cancion_nombre !== undefined) fila.cancion_nombre = b.cancion_nombre.trim() || SIN_CANCION;
  if (b.cancion_artista !== undefined) fila.cancion_artista = b.cancion_artista?.trim() || null;
  if (b.audio_id_ig !== undefined) fila.audio_id_ig = b.audio_id_ig?.trim() || null;
  if (b.puntuacion !== undefined) fila.puntuacion = Math.min(10, Math.max(0, Math.round(Number(b.puntuacion) || 0)));
  if (b.activa !== undefined) fila.activa = Boolean(b.activa);
  if (b.layout_json !== undefined) fila.layout_json = b.layout_json && typeof b.layout_json === "object" ? b.layout_json : null;
  return fila;
}

function error(e: unknown, status = 500) {
  return NextResponse.json({ error: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error interno" }, { status });
}

export async function POST(req: NextRequest) {
  try {
    if (!canUseSupabase()) return error("Supabase no configurado", 503);
    const body = (await req.json()) as Cuerpo;
    if (!body.frase?.trim()) return error("Escribe la frase", 400);
    const { data, error: err } = await createAdminClient()
      .from("banco_frases_canciones")
      .insert({ puntuacion: 5, ...limpiar(body), cancion_nombre: body.cancion_nombre?.trim() || SIN_CANCION, origen: "manual", veces_usada: 0, activa: true })
      .select()
      .single();
    if (err) throw err;
    return NextResponse.json({ data });
  } catch (e) {
    return error(e);
  }
}

// Edita cualquier campo de la frase (texto, cancion, artista, audio, puntuacion, activa)
export async function PATCH(req: NextRequest) {
  try {
    if (!canUseSupabase()) return error("Supabase no configurado", 503);
    const body = (await req.json()) as Cuerpo;
    if (!body.id) return error("Falta id", 400);
    const fila = limpiar(body);
    if (fila.frase === "") return error("La frase no puede estar vacia", 400);
    if (Object.keys(fila).length === 0) return error("Nada que actualizar", 400);
    const { data, error: err } = await createAdminClient()
      .from("banco_frases_canciones")
      .update({ ...fila, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()
      .single();
    if (err) throw err;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!canUseSupabase()) return error("Supabase no configurado", 503);
    const { id } = (await req.json()) as { id?: string };
    if (!id) return error("Falta id", 400);
    const supabase = createAdminClient();
    await supabase.from("banco_frases_usos").delete().eq("frase_id", id);
    const { error: err } = await supabase.from("banco_frases_canciones").delete().eq("id", id);
    if (err) throw err;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
