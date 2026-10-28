import { NextRequest, NextResponse, after } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { columnasTipo } from "@/lib/tipoVideo";
import { elegirFrase, registrarUsoFrase } from "@/lib/frases";
import { evaluarUmbral } from "@/lib/captacion";
import { borrarDeR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Registra un video que la modelo ya subio a R2 y lo manda al runner:
// estado='editando', estado_procesamiento='pendiente', tipo correcto.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesion caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    filename?: string;
    size?: number;
    tipo?: number;
    encargo_id?: string;
    referencia_id?: string;
  };
  const supabasePrefix = `supabase://portal-uploads/${sesion.modeloId}/`;
  if (!body.key || (!body.key.startsWith(`bruto/${sesion.modeloId}/`) && !body.key.startsWith(supabasePrefix))) {
    return NextResponse.json({ error: "Archivo no valido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotente: si ese mismo archivo (esa clave) ya estaba registrado -porque el movil repitio el aviso al perder la respuesta- se devuelve lo ya registrado
  const { data: yaRegistrado } = await supabase.from("library_content").select("id").eq("modelo_id", sesion.modeloId).eq("r2_key", body.key).limit(1).maybeSingle();
  if (yaRegistrado) return NextResponse.json({ ok: true, id: yaRegistrado.id, repetido: true });

  // El mismo video (mismo nombre y tamaño) subido hace poco: no se duplica (suele pasar cuando el movil dijo «error» pero la subida si habia llegado y la modelo lo repite)
  if (body.filename && body.size) {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: igual } = await supabase.from("library_content").select("id").eq("modelo_id", sesion.modeloId).eq("filename_original", body.filename).eq("size_bytes", body.size).gte("recibido_at", desde).limit(1).maybeSingle();
    if (igual) {
      if (body.encargo_id) await supabase.from("encargos").update({ estado: "entregado", updated_at: new Date().toISOString() }).eq("id", body.encargo_id).eq("modelo_id", sesion.modeloId);
      if (body.key.startsWith("bruto/")) await borrarDeR2(body.key).catch(() => undefined); // la copia repetida no se guarda
      return NextResponse.json({ ok: true, id: igual.id, repetido: true });
    }
  }

  let tipo = Number(body.tipo);
  let referenciaId = body.referencia_id ?? null;
  let instrucciones: string | null = null;

  if (body.encargo_id) {
    const { data: encargo } = await supabase
      .from("encargos")
      .select("id, modelo_id, referencia_id, tipo_video, estado, instrucciones")
      .eq("id", body.encargo_id)
      .single();
    if (!encargo || encargo.modelo_id !== sesion.modeloId) {
      return NextResponse.json({ error: "Video pendiente no encontrado" }, { status: 404 });
    }
    if (encargo.estado === "entregado") return NextResponse.json({ error: "Este video ya esta entregado" }, { status: 409 });
    const m = String(encargo.tipo_video ?? "").match(/[1-3]/);
    tipo = m ? Number(m[0]) : tipo;
    referenciaId = encargo.referencia_id ?? referenciaId;
    instrucciones = encargo.instrucciones ?? null;
  }
  if (![1, 2, 3].includes(tipo)) return NextResponse.json({ error: "Tipo de video no valido" }, { status: 400 });
  const refKey: string | null = null; // ya no hay tipo con edicion "igual que la referencia"
  void referenciaId;

  const { data: cuentas } = await supabase
    .from("cuentas_instagram")
    .select("id, tipo")
    .eq("modelo_id", sesion.modeloId)
    .eq("activa", true);
  const cuentaId = (cuentas?.find((c) => c.tipo === "principal") ?? cuentas?.[0])?.id ?? null;

  // Captacion: si la modelo tiene objetivo de videos y la agencia aun no ha aprobado el lote, el video se guarda EN ESPERA (sin editar)
  const { data: modeloCap } = await supabase.from("modelos").select("nombre, objetivo_videos, captacion_aprobada_at, umbral_avisado_at").eq("id", sesion.modeloId).maybeSingle();
  // Los TikTok tambien se quedan en espera (se van acumulando, sin editar), pero NO cuentan como reels: ver progresoCaptacion
  const enCaptacion = Boolean(modeloCap?.objetivo_videos) && !modeloCap?.captacion_aprobada_at;

  // Video de gesto (tipo 2): la frase la pone el editor, del banco (con su musica). En espera no se gasta ninguna frase (se asigna al editarlo)
  const frase = tipo === 2 && !enCaptacion ? await elegirFrase(supabase) : null;
  const ahora = new Date().toISOString();
  const { data: pieza, error } = await supabase
    .from("library_content")
    .insert({
      modelo_id: sesion.modeloId,
      cuenta_id: cuentaId,
      origen: "upload_manual",
      r2_bucket: process.env.R2_BUCKET_NAME ?? "halo-videos",
      r2_key: body.key,
      r2_key_referencia: refKey,
      filename_original: body.filename ?? null,
      mimetype: "video/mp4",
      size_bytes: body.size ?? null,
      titulo: body.filename ?? "Video de la modelo",
      ...columnasTipo(`tipo${tipo}`),
      estado: enCaptacion ? "recibido" : "editando",
      estado_procesamiento: enCaptacion ? null : "pendiente",
      recibido_at: ahora,
      reparto_at: ahora,
      frase_quemada: frase?.frase ?? "",
      layout_json: frase?.layout_json ?? null,
      notas_editor: [instrucciones, frase?.nota].filter(Boolean).join(" | ") || null,
      caption: "",
      correcciones: "",
    })
    .select("id")
    .single();
  if (error || !pieza) return NextResponse.json({ error: error?.message ?? "No se pudo registrar" }, { status: 500 });

  if (frase) await registrarUsoFrase(supabase, frase.id, pieza.id, cuentaId);
  if (body.encargo_id) await supabase.from("encargos").update({ estado: "entregado", updated_at: ahora }).eq("id", body.encargo_id);

  // Telegram: las subidas sueltas NO avisan (van en el resumen diario); solo al llegar al objetivo: "crea su cuenta de Instagram".
  // Se hace DESPUES de contestar: la modelo no tiene que esperar a esto (si tardaba, el movil daba «error» con el video ya guardado)
  if (modeloCap?.objetivo_videos && !modeloCap.umbral_avisado_at) after(() => evaluarUmbral(sesion.modeloId).catch(() => undefined));

  return NextResponse.json({ ok: true, id: pieza.id });
}
