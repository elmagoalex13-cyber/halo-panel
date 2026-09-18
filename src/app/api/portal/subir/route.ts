import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { keyR2 } from "@/lib/media";
import { columnasTipo } from "@/lib/tipoVideo";
import { elegirFrase, registrarUsoFrase } from "@/lib/frases";

export const dynamic = "force-dynamic";

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
  if (!body.key || !body.key.startsWith(`bruto/${sesion.modeloId}/`)) {
    return NextResponse.json({ error: "Archivo no valido" }, { status: 400 });
  }

  const supabase = createAdminClient();
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
    const m = String(encargo.tipo_video ?? "").match(/[1-4]/);
    tipo = m ? Number(m[0]) : tipo;
    referenciaId = encargo.referencia_id ?? referenciaId;
    instrucciones = encargo.instrucciones ?? null;
  }
  if (![1, 2, 3, 4].includes(tipo)) return NextResponse.json({ error: "Tipo de video no valido" }, { status: 400 });

  let refKey: string | null = null;
  if (tipo === 4) {
    if (!referenciaId) return NextResponse.json({ error: "Falta el video de referencia" }, { status: 400 });
    const { data: ref } = await supabase.from("referencias").select("url_r2, url_original").eq("id", referenciaId).single();
    refKey = keyR2(ref?.url_r2);
    if (!refKey) return NextResponse.json({ error: "La referencia todavia no esta disponible" }, { status: 409 });
  }

  const { data: cuentas } = await supabase
    .from("cuentas_instagram")
    .select("id, tipo")
    .eq("modelo_id", sesion.modeloId)
    .eq("activa", true);
  const cuentaId = (cuentas?.find((c) => c.tipo === "principal") ?? cuentas?.[0])?.id ?? null;

  const frase = tipo === 2 ? await elegirFrase(supabase) : null;
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
      estado: "editando",
      estado_procesamiento: "pendiente",
      recibido_at: ahora,
      reparto_at: ahora,
      frase_quemada: frase?.frase ?? "",
      notas_editor: [instrucciones, frase?.nota].filter(Boolean).join(" | ") || null,
      caption: "",
      correcciones: "",
    })
    .select("id")
    .single();
  if (error || !pieza) return NextResponse.json({ error: error?.message ?? "No se pudo registrar" }, { status: 500 });

  if (frase) await registrarUsoFrase(supabase, frase.id, pieza.id, cuentaId);
  if (body.encargo_id) await supabase.from("encargos").update({ estado: "entregado", updated_at: ahora }).eq("id", body.encargo_id);

  return NextResponse.json({ ok: true, id: pieza.id });
}
