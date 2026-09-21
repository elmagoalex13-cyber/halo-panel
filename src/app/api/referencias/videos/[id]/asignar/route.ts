import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Aprueba un video viral del scraper. Si el video tiene archivo descargado, la modelo lo ve
// en su portal; si no, solo los tipos 1-3 pueden caer a una tarea simple sin video.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { modelo_id?: string; modelo_ids?: string[]; tipo?: number; instrucciones?: string | null };
  const modelos = Array.from(new Set(body.modelo_ids?.length ? body.modelo_ids : body.modelo_id ? [body.modelo_id] : []));
  const tipo = Number(body.tipo);
  if (!modelos.length) return NextResponse.json({ error: "Elige al menos una modelo" }, { status: 400 });
  if (![1, 2, 3, 4].includes(tipo)) return NextResponse.json({ error: "Elige un tipo de video (1-4)" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  try {
    const supabase = createAdminClient();
    const { data: video, error: vErr } = await supabase
      .from("referencias_videos")
      .select("id, cuenta_id, video_url, thumbnail_url, descripcion, referencias_cuentas:cuenta_id(username)")
      .eq("id", id)
      .single();
    if (vErr || !video) return NextResponse.json({ error: "Video no encontrado" }, { status: 404 });
    if (tipo === 4 && !video.video_url) return NextResponse.json({ error: "El video no tiene archivo descargado" }, { status: 409 });

    const username = (video.referencias_cuentas as unknown as { username?: string } | null)?.username ?? null;
    const codigo = video.video_url ? String(video.video_url).match(/([^/]+)\.mp4$/)?.[1] : null;
    const permalink = video.video_url ? (codigo ? `https://www.instagram.com/reel/${codigo}/` : String(video.video_url)) : null;

    // cuenta en cuentas_referencia (para referencias.cuenta_ref_id)
    let cuentaRefId: string | null = null;
    if (username) {
      const { data: cr } = await supabase.from("cuentas_referencia").select("id").eq("username", username).maybeSingle();
      cuentaRefId = cr?.id ?? null;
      if (!cuentaRefId) {
        const { data: nueva } = await supabase.from("cuentas_referencia").insert({ username, activa: true }).select("id").single();
        cuentaRefId = nueva?.id ?? null;
      }
    }

    const tipoVideo = `tipo${tipo}`;
    let referenciaId: string | null = null;
    if (permalink && video.video_url) {
      const { data: existente } = await supabase.from("referencias").select("id").eq("url_original", permalink).maybeSingle();
      if (existente) {
        referenciaId = existente.id;
        await supabase.from("referencias").update({ tipo_video: tipoVideo, activa: true, updated_at: new Date().toISOString() }).eq("id", existente.id);
      } else {
        const { data: ref, error: rErr } = await supabase
          .from("referencias")
          .insert({
            cuenta_ref_id: cuentaRefId,
            url_original: permalink,
            url_r2: video.video_url,
            thumbnail_url: video.thumbnail_url,
            descripcion: video.descripcion,
            tipo_video: tipoVideo,
            activa: true,
          })
          .select("id")
          .single();
        if (rErr || !ref) throw rErr ?? new Error("No se pudo crear la referencia");
        referenciaId = ref.id;
      }
    }

    const encargoIds: string[] = [];
    for (const modeloId of modelos) {
      const query = supabase
        .from("encargos")
        .select("id")
        .eq("modelo_id", modeloId)
        .eq("tipo_video", tipoVideo)
        .neq("estado", "entregado");
      const { data: previo } = await (referenciaId ? query.eq("referencia_id", referenciaId) : query.is("referencia_id", null)).maybeSingle();
      if (previo) {
        encargoIds.push(previo.id);
        continue;
      }
      const { data: enc, error: eErr } = await supabase
        .from("encargos")
        .insert({
          modelo_id: modeloId,
          referencia_id: referenciaId,
          tipo_video: tipoVideo,
          estado: "pendiente",
          instrucciones: body.instrucciones?.trim() || null,
        })
        .select("id")
        .single();
      if (eErr || !enc) throw eErr ?? new Error("No se pudo crear el encargo");
      encargoIds.push(enc.id);
    }

    const ahora = new Date().toISOString();
    const upd = { estado_triaje: "confirmado", formato_confirmado: tipoVideo, confirmado_at: ahora };
    let { error } = await supabase.from("referencias_videos").update(upd).eq("id", id);
    if (error && /confirmado_at/.test(error.message)) ({ error } = await supabase.from("referencias_videos").update({ estado_triaje: "confirmado", formato_confirmado: tipoVideo }).eq("id", id));
    if (error) throw error;

    return NextResponse.json({ ok: true, referencia_id: referenciaId, encargo_ids: encargoIds, confirmado_at: ahora });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error interno" }, { status: 500 });
  }
}
