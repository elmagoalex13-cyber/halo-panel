import { NextRequest, NextResponse } from "next/server";
import { updateDemoVideo } from "@/lib/demo-approvals";
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
      const ok = await updateDemoVideo(id, {
        estado: nuevoEstado,
        caption: caption ?? "",
        correcciones: correcciones ?? "",
        frase_quemada: frase_quemada ?? "",
        notas_editor: frase_quemada ?? correcciones ?? "",
        updated_at: new Date().toISOString(),
        ...(accion === "aprobar" ? { aprobado_at: new Date().toISOString() } : {}),
      });

      if (!ok) {
        return NextResponse.json({ error: "Video demo no encontrado" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, demo: true, estado: nuevoEstado });
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

    const { error } = await supabase.from("library_content").update(update).eq("id", id);
    if (error) throw error;

    await supabase
      .from("log_agentes")
      .insert({
        agente: "mesa-aprobacion",
        accion,
        resultado: "ok",
        detalle: { content_id: id },
      })
      .then(() => undefined, () => undefined);

    return NextResponse.json({ ok: true, estado: nuevoEstado });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
