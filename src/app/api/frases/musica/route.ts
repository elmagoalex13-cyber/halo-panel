import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { existeEnR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Musica de las frases del banco (todas deben tenerla): se puede poner la de un video guardado de «frases con musica» o subir un audio.
//  GET                                   -> videos de cuentas de frases (con su cancion) para elegir de donde sacar la musica
//  POST { accion: "desde_video", frase_id, video_id } -> el editor saca el audio de ese video y lo pone a la frase (en un minuto)
//  POST { accion: "subida", frase_id, contentType }   -> URL firmada para subir un audio directamente a la frase
//  POST { accion: "subida_hecha", frase_id }          -> confirma la subida (la frase pasa a tener musica)
const claveAudio = (id: string) => `frases-audio/${id}.m4a`;
const UUID = /^[0-9a-f-]{36}$/i;

function r2() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    forcePathStyle: true,
  });
}

async function marcarConMusica(frase_id: string) {
  const db = createAdminClient();
  const { data } = await db.from("panel_config").select("value").eq("key", "frases_con_audio").maybeSingle();
  const ids = new Set(((data?.value as { ids?: string[] } | null)?.ids ?? []) as string[]);
  ids.add(frase_id);
  await db.from("panel_config").upsert({ key: "frases_con_audio", value: { ids: [...ids] }, updated_at: new Date().toISOString() });
}

export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const db = createAdminClient();
  const { data: cuentas } = await db.from("referencias_cuentas").select("id, username").eq("categoria", "frases");
  if (!cuentas?.length) return NextResponse.json({ videos: [] });
  const nombre = new Map(cuentas.map((c) => [c.id as string, c.username as string]));
  const { data } = await db
    .from("referencias_videos")
    .select("id, cuenta_id, thumbnail_url, video_url, frase_detectada, tags, estado_triaje, visitas")
    .in("cuenta_id", cuentas.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(80);
  const tag = (tags: string[] | null, k: string) => (tags ?? []).find((t) => t.startsWith(`${k}=`))?.slice(k.length + 1) ?? null;
  return NextResponse.json({
    videos: (data ?? []).map((v) => ({
      id: v.id,
      cuenta: nombre.get(v.cuenta_id as string) ?? "?",
      thumbnail_url: v.thumbnail_url,
      frase: v.frase_detectada,
      cancion: tag(v.tags as string[] | null, "meta:cancion"),
      artista: tag(v.tags as string[] | null, "meta:artista"),
      estado: v.estado_triaje,
      visitas: v.visitas,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; frase_id?: string; video_id?: string; contentType?: string };
  const fraseId = typeof b.frase_id === "string" && UUID.test(b.frase_id) ? b.frase_id : "";
  if (!fraseId) return NextResponse.json({ error: "Falta la frase" }, { status: 400 });
  const db = createAdminClient();
  const { data: frase } = await db.from("banco_frases_canciones").select("id").eq("id", fraseId).maybeSingle();
  if (!frase) return NextResponse.json({ error: "Frase no encontrada" }, { status: 404 });

  if (b.accion === "desde_video") {
    if (typeof b.video_id !== "string" || !UUID.test(b.video_id)) return NextResponse.json({ error: "Falta el vídeo" }, { status: 400 });
    // Cola para el editor (el audio se saca en el servidor de video). Si hay otro pedido a la vez, se vuelve a leer y reintentar.
    for (let i = 0; i < 5; i++) {
      const { data: fila } = await db.from("panel_config").select("value, updated_at").eq("key", "frases_audio_pedidos").maybeSingle();
      const items = (((fila?.value as { items?: Array<{ frase_id: string; video_id: string }> } | null)?.items) ?? []).filter((x) => x.frase_id !== fraseId);
      const valor = { items: [...items, { frase_id: fraseId, video_id: b.video_id }] };
      const ahora = new Date().toISOString();
      if (!fila) {
        const { error } = await db.from("panel_config").insert({ key: "frases_audio_pedidos", value: valor, updated_at: ahora });
        if (!error) return NextResponse.json({ ok: true });
      } else {
        const { data: ok } = await db.from("panel_config").update({ value: valor, updated_at: ahora }).eq("key", "frases_audio_pedidos").eq("updated_at", fila.updated_at as string).select("key");
        if (ok?.length) return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "No se pudo guardar el pedido, inténtalo otra vez" }, { status: 500 });
  }

  if (b.accion === "subida") {
    const tipo = typeof b.contentType === "string" && /^(audio|video)\//.test(b.contentType) ? b.contentType : "";
    if (!tipo) return NextResponse.json({ error: "Sube un archivo de audio o de video" }, { status: 400 });
    const url = await getSignedUrl(r2(), new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME ?? "halo-videos", Key: claveAudio(fraseId), ContentType: tipo }), { expiresIn: 3600 });
    return NextResponse.json({ url });
  }

  if (b.accion === "subida_hecha") {
    if (!(await existeEnR2(claveAudio(fraseId)))) return NextResponse.json({ error: "No se ha encontrado el archivo subido" }, { status: 409 });
    await marcarConMusica(fraseId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
