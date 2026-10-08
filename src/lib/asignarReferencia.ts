import type { createAdminClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createAdminClient>;

export type ResultadoAsignacion =
  | { ok: true; referenciaId: string | null; encargoIds: string[]; nuevos: string[]; yaTenian: string[]; confirmadoAt: string }
  | { ok: false; status: number; error: string };

/** Cache de cuentas_referencia por username para no repetir consultas al asignar muchos videos seguidos. */
export type CacheCuentas = Map<string, string | null>;

/**
 * Asigna un video viral (referencias_videos) a una o varias modelos y lo marca como aprobado.
 * Sirve para el primer envio y para anadir mas modelos a un video que ya estaba aprobado:
 * a quien ya lo tiene (en cualquier estado) no se le duplica, se devuelve en `yaTenian`.
 * `tipo` omitido = el que ya tiene confirmado el video.
 */
export async function asignarVideoAModelos(
  supabase: Db,
  videoId: string,
  modelos: string[],
  opts: { tipo?: number; instrucciones?: string | null; cuentas?: CacheCuentas } = {},
): Promise<ResultadoAsignacion> {
  const { data: video, error: vErr } = await supabase
    .from("referencias_videos")
    .select("id, cuenta_id, video_url, thumbnail_url, descripcion, formato_confirmado, referencias_cuentas:cuenta_id(username)")
    .eq("id", videoId)
    .single();
  if (vErr || !video) return { ok: false, status: 404, error: "Video no encontrado" };

  const tipo = opts.tipo ?? (Number(String(video.formato_confirmado ?? "").replace(/\D/g, "")) || 0);
  if (![1, 2, 3, 4].includes(tipo)) return { ok: false, status: 400, error: "Elige un tipo de video (1-4)" };
  if (tipo === 4 && !video.video_url) return { ok: false, status: 409, error: "El video no tiene archivo descargado" };

  const username = (video.referencias_cuentas as unknown as { username?: string } | null)?.username ?? null;
  const codigo = video.video_url ? String(video.video_url).match(/([^/]+)\.mp4$/)?.[1] : null;
  const permalink = video.video_url ? (codigo ? `https://www.instagram.com/reel/${codigo}/` : String(video.video_url)) : null;

  // cuenta en cuentas_referencia (para referencias.cuenta_ref_id)
  let cuentaRefId: string | null = null;
  if (username) {
    const cache = opts.cuentas;
    if (cache?.has(username)) cuentaRefId = cache.get(username) ?? null;
    else {
      const { data: cr } = await supabase.from("cuentas_referencia").select("id").eq("username", username).maybeSingle();
      cuentaRefId = cr?.id ?? null;
      if (!cuentaRefId) {
        const { data: nueva } = await supabase.from("cuentas_referencia").insert({ username, activa: true }).select("id").single();
        cuentaRefId = nueva?.id ?? null;
      }
      cache?.set(username, cuentaRefId);
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

  // Quien ya tiene este video: una sola consulta para todas las modelos
  let previas = supabase.from("encargos").select("id, modelo_id, estado").in("modelo_id", modelos).eq("tipo_video", tipoVideo);
  previas = referenciaId ? previas.eq("referencia_id", referenciaId) : previas.is("referencia_id", null).neq("estado", "entregado");
  const { data: yaHay } = await previas;
  const tienen = new Map((yaHay ?? []).map((e) => [e.modelo_id as string, e.id as string]));

  const nuevos = modelos.filter((m) => !tienen.has(m));
  const encargoIds = [...tienen.values()];
  if (nuevos.length) {
    const { data: creados, error: eErr } = await supabase
      .from("encargos")
      .insert(nuevos.map((modelo_id) => ({ modelo_id, referencia_id: referenciaId, tipo_video: tipoVideo, estado: "pendiente", instrucciones: opts.instrucciones?.trim() || null })))
      .select("id");
    if (eErr || !creados) throw eErr ?? new Error("No se pudo crear el encargo");
    encargoIds.push(...creados.map((c) => c.id as string));
  }

  const ahora = new Date().toISOString();
  const upd = { estado_triaje: "confirmado", formato_confirmado: tipoVideo, confirmado_at: ahora };
  let { error } = await supabase.from("referencias_videos").update(upd).eq("id", videoId);
  if (error && /confirmado_at/.test(error.message)) ({ error } = await supabase.from("referencias_videos").update({ estado_triaje: "confirmado", formato_confirmado: tipoVideo }).eq("id", videoId));
  if (error) throw error;

  return { ok: true, referenciaId, encargoIds, nuevos, yaTenian: modelos.filter((m) => tienen.has(m)), confirmadoAt: ahora };
}
