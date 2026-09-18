import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
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
    const update: Record<string, unknown> = {
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    };

    if (caption !== undefined) update.caption = caption;
    if (correcciones !== undefined) update.correcciones = correcciones;
    if (frase_quemada !== undefined) update.frase_quemada = frase_quemada;
    if (accion === "aprobar") update.aprobado_at = new Date().toISOString();
    if (accion === "rehacer") {
      // El runner vuelve a coger la pieza: reset del estado de procesamiento
      update.estado_procesamiento = "pendiente";
      update.error_mensaje = null;
    }

    const { error } = await supabase.from("library_content").update(update).eq("id", id);
    if (error) throw error;

    await supabase
      .from("log_agentes")
      .insert({
        agente: "runner_edicion",
        accion: `mesa_${accion}`,
        resultado: "ok",
        detalle: { content_id: id },
      })
      .then(() => undefined, () => undefined);

    return NextResponse.json({ ok: true, estado: nuevoEstado });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
