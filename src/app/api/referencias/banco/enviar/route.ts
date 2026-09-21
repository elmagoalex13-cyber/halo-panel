import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Envia una referencia a una modelo creando un encargo (tabla `encargos`).
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    modelo_id?: string;
    banco_id?: string;
    url_referencia_ig?: string | null;
    descripcion?: string | null;
    instrucciones?: string | null;
    tipo_video?: string | null;
  };

  if (!body.modelo_id) {
    return NextResponse.json({ error: "modelo_id requerido" }, { status: 400 });
  }
  if (!canUseSupabase()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const tipoMatch = String(body.tipo_video ?? "tipo4").match(/[1-4]/);
    const tipoVideo = `tipo${tipoMatch?.[0] ?? "4"}`;
    const url = body.url_referencia_ig?.trim() || null;

    let referenciaId: string | null = null;
    if (body.banco_id) {
      const { data: refPorId } = await supabase.from("referencias").select("id").eq("id", body.banco_id).maybeSingle();
      referenciaId = refPorId?.id ?? null;
    }

    if (!referenciaId && url) {
      const { data: existente } = await supabase.from("referencias").select("id").eq("url_original", url).maybeSingle();
      if (existente) {
        referenciaId = existente.id;
        await supabase
          .from("referencias")
          .update({ tipo_video: tipoVideo, descripcion: body.descripcion ?? null, activa: true, updated_at: new Date().toISOString() })
          .eq("id", existente.id);
      } else {
        const { data: nueva, error: nuevaErr } = await supabase
          .from("referencias")
          .insert({ url_original: url, descripcion: body.descripcion ?? null, tipo_video: tipoVideo, activa: true })
          .select("id")
          .single();
        if (nuevaErr || !nueva) throw nuevaErr ?? new Error("No se pudo crear la referencia");
        referenciaId = nueva.id;
      }
    }

    if (!referenciaId) {
      return NextResponse.json({ error: "Referencia no encontrada" }, { status: 404 });
    }

    const { data: previo } = await supabase
      .from("encargos")
      .select("id")
      .eq("modelo_id", body.modelo_id)
      .eq("referencia_id", referenciaId)
      .neq("estado", "entregado")
      .maybeSingle();
    if (previo) return NextResponse.json({ ok: true, data: previo, ya_asignado: true });

    const { data, error } = await supabase
      .from("encargos")
      .insert({
        modelo_id: body.modelo_id,
        referencia_id: referenciaId,
        tipo_video: tipoVideo,
        pagina_url: url,
        instrucciones: body.instrucciones ?? null,
        estado: "pendiente",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
