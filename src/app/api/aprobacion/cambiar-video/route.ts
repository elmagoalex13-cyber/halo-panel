import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { existeEnR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

// POST /api/aprobacion/cambiar-video   { id, key }
// Registra el video que has editado tu a mano como el video EDITADO de la pieza. El archivo ya lo subio el
// navegador directo a R2 (URL firmada, byte a byte, sin pasar por el servidor ni recomprimirse). El original
// de la modelo no se toca.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { id?: string; key?: string } | null;
  const id = body?.id;
  const key = body?.key;
  if (!id || !key || !key.startsWith(`editados/${id}/`) || key.includes("..") || !/^[\w\-./]+$/.test(key)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  if (!(await existeEnR2(key))) return NextResponse.json({ error: "El archivo no llego al almacen; vuelve a subirlo" }, { status: 404 });

  const supabase = createAdminClient();
  const { data: pieza } = await supabase.from("library_content").select("id, estado, notas_editor").eq("id", id).maybeSingle();
  if (!pieza) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });

  const ahora = new Date().toISOString();
  const nota = `Video sustituido a mano (${ahora.slice(0, 10)})`;
  const { error } = await supabase
    .from("library_content")
    .update({
      video_procesado_url: `${(process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}`,
      estado_procesamiento: "listo",
      error_mensaje: null,
      procesado_en: ahora,
      // si estaba en cola o con error, pasa a revision; en cualquier otro estado se queda como esta
      ...(pieza.estado === "editando" ? { estado: "en_aprobacion" } : {}),
      notas_editor: [pieza.notas_editor, nota].filter(Boolean).join("\n"),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
