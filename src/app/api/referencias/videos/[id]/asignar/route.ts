import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Aprueba un video viral del scraper: lo etiqueta con un tipo (1-4), lo mete en el banco de
// referencias (`referencias`) y se lo asigna a una modelo (`encargos`), que lo vera en su portal
// como "video pendiente" con la referencia y el boton de subir su version.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { modelo_id?: string; tipo?: number; instrucciones?: string | null };
  const tipo = Number(body.tipo);
  if (!body.modelo_id) return NextResponse.json({ error: "Elige una modelo" }, { status: 400 });
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
    if (!video.video_url) return NextResponse.json({ error: "El video no tiene archivo descargado" }, { status: 409 });

    const username = (video.referencias_cuentas as unknown as { username?: string } | null)?.username ?? null;
    const codigo = String(video.video_url).match(/([^/]+)\.mp4$/)?.[1];
    const permalink = codigo ? `https://www.instagram.com/reel/${codigo}/` : String(video.video_url);

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

    // referencia en el banco (se reutiliza si ya existe)
    const tipoVideo = `tipo${tipo}`;
    let referenciaId: string | null = null;
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

    // encargo para la modelo (si ya tiene uno pendiente con esta referencia, no se duplica)
    const { data: previo } = await supabase
      .from("encargos")
      .select("id")
      .eq("modelo_id", body.modelo_id)
      .eq("referencia_id", referenciaId)
      .neq("estado", "entregado")
      .maybeSingle();
    let encargoId = previo?.id ?? null;
    if (!encargoId) {
      const { data: enc, error: eErr } = await supabase
        .from("encargos")
        .insert({
          modelo_id: body.modelo_id,
          referencia_id: referenciaId,
          tipo_video: tipoVideo,
          estado: "pendiente",
          instrucciones: body.instrucciones?.trim() || null,
        })
        .select("id")
        .single();
      if (eErr || !enc) throw eErr ?? new Error("No se pudo crear el encargo");
      encargoId = enc.id;
    }

    const ahora = new Date().toISOString();
    const upd = { estado_triaje: "confirmado", confirmado_at: ahora };
    let { error } = await supabase.from("referencias_videos").update(upd).eq("id", id);
    if (error && /confirmado_at/.test(error.message)) ({ error } = await supabase.from("referencias_videos").update({ estado_triaje: "confirmado" }).eq("id", id));
    if (error) throw error;

    return NextResponse.json({ ok: true, referencia_id: referenciaId, encargo_id: encargoId, confirmado_at: ahora });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error interno" }, { status: 500 });
  }
}
