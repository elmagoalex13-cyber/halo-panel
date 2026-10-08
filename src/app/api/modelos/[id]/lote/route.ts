import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { encolarTelegram } from "@/lib/telegramCola";

export const dynamic = "force-dynamic";

// POST { forzar?: boolean }  Aprueba el lote de una modelo en captacion: todos sus videos EN ESPERA pasan a la cola de edicion y, desde
// ahora, lo que suba se edita directamente. Exige haber llegado al objetivo salvo que se fuerce (con confirmacion en la pantalla).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  { const g = await exigirModelo(id); if (g) return g; }
  const body = (await req.json().catch(() => null)) as { forzar?: boolean } | null;

  const db = createAdminClient();
  const { data: modelo } = await db.from("modelos").select("nombre, objetivo_videos, captacion_aprobada_at").eq("id", id).maybeSingle();
  if (!modelo) return NextResponse.json({ error: "Modelo no encontrada" }, { status: 404 });

  const { count } = await db.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", id).eq("estado", "recibido");
  const enEspera = count ?? 0;
  const objetivo = Number(modelo.objetivo_videos ?? 0);
  if (!body?.forzar && objetivo && enEspera < objetivo) {
    return NextResponse.json({ error: `Aún no llega al mínimo: ${enEspera} de ${objetivo} vídeos.` }, { status: 409 });
  }

  const ahora = new Date().toISOString();
  const { data: pasados, error } = await db
    .from("library_content")
    .update({ estado: "editando", estado_procesamiento: "pendiente", reparto_at: ahora, updated_at: ahora })
    .eq("modelo_id", id)
    .eq("estado", "recibido")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("modelos").update({ captacion_aprobada_at: ahora }).eq("id", id);

  await encolarTelegram("lote", id, { n: pasados?.length ?? 0 });
  return NextResponse.json({ ok: true, aprobados: pasados?.length ?? 0 });
}
