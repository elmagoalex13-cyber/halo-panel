import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!canUseSupabase()) {
      return NextResponse.json({
        data: {
          id: crypto.randomUUID(),
          frase: body.frase,
          cancion_nombre: body.cancion_nombre,
          cancion_artista: body.cancion_artista || null,
          audio_id_ig: body.audio_id_ig || null,
          origen: "manual",
          puntuacion: body.puntuacion ?? 5,
          veces_usada: 0,
          activa: true,
        },
      });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("banco_frases_canciones")
      .insert({
        frase: body.frase,
        cancion_nombre: body.cancion_nombre,
        cancion_artista: body.cancion_artista || null,
        audio_id_ig: body.audio_id_ig || null,
        puntuacion: body.puntuacion ?? 5,
        origen: "manual",
        veces_usada: 0,
        activa: true,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, activa } = (await req.json()) as { id?: string; activa?: boolean };
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });
    const supabase = createAdminClient();
    const { error } = await supabase.from("banco_frases_canciones").update({ activa }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });
    const supabase = createAdminClient();
    const { error } = await supabase.from("banco_frases_canciones").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
