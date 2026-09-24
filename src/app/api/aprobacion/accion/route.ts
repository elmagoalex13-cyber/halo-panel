import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { programarPieza } from "@/lib/publer";
import type { VideoEstado } from "@/types";

const ESTADO_MAP: Record<string, string> = {
  aprobar: "aprobado",
  rehacer: "editando",
  descartar: "rechazado",
};

export async function PATCH(req: NextRequest) {
  try {
    const { id, accion, caption, correcciones, frase_quemada } = (await req.json()) as {
      id?: string;
      accion?: string;
      caption?: string;
      correcciones?: string;
      frase_quemada?: string;
    };

    if (!id || !accion || !ESTADO_MAP[accion]) {
      return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
    }

    const nuevoEstado = ESTADO_MAP[accion] as VideoEstado;

    if (!canUseSupabase()) {
      return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
    }

    const supabase = createAdminClient();
    const { data: actual, error: actualError } = await supabase
      .from("library_content")
      .select("id, estado")
      .eq("id", id)
      .maybeSingle();
    if (actualError) throw actualError;
    if (!actual) return NextResponse.json({ error: "Video no encontrado" }, { status: 404 });
    if (actual.estado !== "en_aprobacion") {
      return NextResponse.json({ ok: true, estado: actual.estado, skipped: true });
    }

    const update: Record<string, unknown> = {
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    };

    if (caption !== undefined) update.caption = caption;
    if (correcciones !== undefined) update.correcciones = correcciones;
    if (frase_quemada !== undefined) update.frase_quemada = frase_quemada;
    if (accion === "aprobar") {
      update.aprobado_at = new Date().toISOString();
      update.estado_procesamiento = "aprobado";
      update.error_mensaje = null;
    }
    if (accion === "descartar") {
      update.estado_procesamiento = "descartado";
      update.error_mensaje = null;
    }
    if (accion === "rehacer") {
      // El runner vuelve a coger la pieza: reset del estado de procesamiento
      update.estado_procesamiento = "pendiente";
      update.error_mensaje = null;
      update.aprobado_at = null;
      update.publicado_at = null;
    }

    const { data: updated, error } = await supabase
      .from("library_content")
      .update(update)
      .eq("id", id)
      .eq("estado", "en_aprobacion")
      .select("id");
    if (error) throw error;
    if (!updated?.length) return NextResponse.json({ ok: true, estado: actual.estado, skipped: true });

    await supabase
      .from("log_agentes")
      .insert({
        agente: "runner_edicion",
        accion: `mesa_${accion}`,
        resultado: "ok",
        detalle: { content_id: id },
      })
      .then(() => undefined, () => undefined);

    // Aprobado => el agente lo programa en Publer segun las reglas de horario
    const programacion = accion === "aprobar" ? await programarPieza(supabase, id) : undefined;
    return NextResponse.json({ ok: true, estado: nuevoEstado, programacion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
