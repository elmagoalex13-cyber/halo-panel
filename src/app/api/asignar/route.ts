import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Crea encargos para una o varias modelos. Si se pasan URLs, la modelo ve esos videos
// en su portal; si no, los tipos 1-3 son tareas simples sin video asociado.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    urls?: string[] | string;
    tipo?: number;
    modelo_ids?: string[];
    instrucciones?: string | null;
  };
  const urls = Array.from(
    new Set(
      (Array.isArray(body.urls) ? body.urls : String(body.urls ?? "").split(/[\s,]+/))
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  );
  const invalidas = urls.filter((u) => !/^https?:\/\/\S+$/i.test(u));
  const tipo = Number(body.tipo);
  const modelos = Array.from(new Set(body.modelo_ids ?? []));

  if (![1, 2, 3, 4].includes(tipo)) return NextResponse.json({ error: "Elige el tipo de video (1-4)" }, { status: 400 });
  if (tipo === 4 && !urls.length) return NextResponse.json({ error: "Pega al menos una URL de referencia" }, { status: 400 });
  if (invalidas.length) return NextResponse.json({ error: `URL no valida: ${invalidas[0]}` }, { status: 400 });
  if (!modelos.length) return NextResponse.json({ error: "Elige al menos una modelo" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  try {
    const supabase = createAdminClient();
    const tipoVideo = `tipo${tipo}`;
    let referenciasNuevas = 0;
    let encargosCreados = 0;
    let yaAsignados = 0;

    if (tipo !== 4 && urls.length === 0) {
      const instrucciones = body.instrucciones?.trim() || null;
      for (const modeloId of modelos) {
        const query = supabase
          .from("encargos")
          .select("id")
          .eq("modelo_id", modeloId)
          .eq("tipo_video", tipoVideo)
          .is("referencia_id", null)
          .neq("estado", "entregado");
        const { data: previo } = await (instrucciones ? query.eq("instrucciones", instrucciones) : query.is("instrucciones", null)).maybeSingle();
        if (previo) {
          yaAsignados++;
          continue;
        }
        const { error } = await supabase.from("encargos").insert({
          modelo_id: modeloId,
          referencia_id: null,
          tipo_video: tipoVideo,
          estado: "pendiente",
          instrucciones,
        });
        if (error) throw error;
        encargosCreados++;
      }
      return NextResponse.json({ ok: true, urls: 0, referencias_nuevas: 0, encargos: encargosCreados, ya_asignados: yaAsignados });
    }

    for (const url of urls) {
      const { data: existente } = await supabase.from("referencias").select("id").eq("url_original", url).maybeSingle();
      let referenciaId = existente?.id as string | undefined;
      if (referenciaId) {
        await supabase.from("referencias").update({ tipo_video: tipoVideo, activa: true, updated_at: new Date().toISOString() }).eq("id", referenciaId);
      } else {
        const { data: ref, error } = await supabase.from("referencias").insert({ url_original: url, tipo_video: tipoVideo, activa: true }).select("id").single();
        if (error || !ref) throw error ?? new Error("No se pudo guardar la referencia");
        referenciaId = ref.id;
        referenciasNuevas++;
      }
      for (const modeloId of modelos) {
        const { data: previo } = await supabase
          .from("encargos")
          .select("id")
          .eq("modelo_id", modeloId)
          .eq("referencia_id", referenciaId)
          .neq("estado", "entregado")
          .maybeSingle();
        if (previo) {
          yaAsignados++;
          continue;
        }
        const { error } = await supabase.from("encargos").insert({
          modelo_id: modeloId,
          referencia_id: referenciaId,
          tipo_video: tipoVideo,
          estado: "pendiente",
          instrucciones: body.instrucciones?.trim() || null,
        });
        if (error) throw error;
        encargosCreados++;
      }
    }
    return NextResponse.json({ ok: true, urls: urls.length, referencias_nuevas: referenciasNuevas, encargos: encargosCreados, ya_asignados: yaAsignados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error interno" }, { status: 500 });
  }
}

// Cancela un encargo que la modelo aun no ha entregado
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { error } = await createAdminClient().from("encargos").delete().eq("id", id).neq("estado", "entregado");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
