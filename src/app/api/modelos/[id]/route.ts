import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, modeloProhibido, veModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { errorDb } from "@/lib/erroresDb";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const alcance = await alcanceActual();
    if (!veModelo(alcance, id)) return modeloProhibido();
    const body = await req.json();
    const allowed = ["nombre", "nombre_real", "email", "telefono", "notas", "porcentaje_comision", "activa"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (!(key in body)) continue;
      const v = body[key];
      // Los textos vacios se guardan como "sin dato" (null): asi dos modelos sin email no chocan con el email unico
      payload[key] = typeof v === "string" && ["nombre_real", "email", "telefono", "notas"].includes(key) ? v.trim() || null : v;
    }

    // Objetivo de la fase de captacion (videos que debe subir antes de editar); vacio = sin captacion
    if ("objetivo_videos" in body) {
      const n = Math.round(Number(body.objetivo_videos));
      payload.objetivo_videos = body.objetivo_videos === null || body.objetivo_videos === "" || !Number.isFinite(n) || n <= 0 ? null : Math.min(n, 500);
    }

    // Solo el dueño decide que modelos comparte con su socio
    if (alcance.dueno && (body.ambito === "privado" || body.ambito === "compartido")) payload.ambito = body.ambito;

    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("modelos").update(payload).eq("id", id).select().single();
    if (error) {
      const e = errorDb(error, "No se pudo guardar la modelo");
      return NextResponse.json({ error: e.mensaje }, { status: e.estado });
    }
    // Al poner objetivo de reels, los demas minimos (si no estaban) quedan en lo habitual: 4 scripts, 5 packs y 30 posts
    if (payload.objetivo_videos) {
      await supabase.from("modelos").update({ objetivo_scripts: 4 }).eq("id", id).is("objetivo_scripts", null);
      await supabase.from("modelos").update({ objetivo_packs: 5 }).eq("id", id).is("objetivo_packs", null);
      await supabase.from("modelos").update({ objetivo_posts: 30 }).eq("id", id).is("objetivo_posts", null);
    }
    return NextResponse.json({ data });
  } catch (error) {
    const e = errorDb(error, "Error interno");
    return NextResponse.json({ error: e.mensaje }, { status: e.estado });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // "Eliminar" manda la modelo a la PAPELERA: desaparece del panel y de su portal, pero no se borra nada y el dueño la puede restaurar
    const alcance = await alcanceActual();
    if (!veModelo(alcance, id)) return modeloProhibido();
    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
    const sesion = await sesionPanelActual();
    const supabase = createAdminClient();
    const { error } = await supabase.from("modelos").update({ eliminada_at: new Date().toISOString(), eliminada_por: sesion?.usuario ?? null }).eq("id", id);
    if (error) {
      if (/eliminada/i.test(error.message)) return NextResponse.json({ error: "Falta ejecutar el SQL 20261016_papelera.sql en Supabase." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
