import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// POST: crear entrada manual en library_content
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modelo_id, cuenta_id, titulo, tipo_video, drive_url, notas_editor } = body as {
      modelo_id?: string;
      cuenta_id?: string;
      titulo?: string;
      tipo_video?: string;
      drive_url?: string;
      notas_editor?: string;
    };

    if (!modelo_id) {
      return NextResponse.json({ error: "modelo_id requerido" }, { status: 400 });
    }

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), modelo_id, titulo, estado: "en_aprobacion" } });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("library_content")
      .insert({
        modelo_id,
        cuenta_id: cuenta_id || null,
        titulo: titulo || "Sin título",
        tipo_video: tipo_video || "sin_clasificar",
        drive_url: drive_url || null,
        notas_editor: notas_editor || null,
        estado: "en_aprobacion",
        recibido_at: new Date().toISOString(),
        caption: "",
        frase_quemada: "",
        correcciones: "",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
