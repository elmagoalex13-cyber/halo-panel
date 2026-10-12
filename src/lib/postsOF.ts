import { createAdminClient } from "@/lib/supabase/server";
import { miniaturasDeModelo, urlVistaFoto } from "@/lib/ofMiniaturas";
import { generarCaption, personaDe, type ResultadoCaption } from "@/lib/postsCaptionIA";
import { proximosHuecos } from "@/lib/postsHorarios";
import { sanearDatos } from "@/lib/onboarding";

type Db = ReturnType<typeof createAdminClient>;

/** ¿Tiene esta modelo un perfil activo en Venuz? (cuenta de Venuz vinculada y activa). */
export async function cuentaVenuzActiva(db: Db, modeloId: string): Promise<{ id: string; nombre: string } | null> {
  const { data } = await db.from("venuz_cuentas").select("id, nombre").eq("modelo_id", modeloId).eq("activa", true).limit(1).maybeSingle();
  return data ? { id: data.id as string, nombre: data.nombre as string } : null;
}

async function imagenBase64(db: Db, archivo: { storage_key: string; bucket: string }, minis: Set<string>): Promise<string | null> {
  try {
    const url = await urlVistaFoto(archivo.storage_key, archivo.bucket, minis);
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 4.5 * 1024 * 1024) return null; // sin miniatura la original puede ser enorme: no se manda
    return buf.toString("base64");
  } catch {
    return null;
  }
}

/** Voz de la modelo (onboarding) y ultimos captions, para escribir uno nuevo que suene a ella y no se repita. */
export async function contextoCaption(db: Db, modeloId: string) {
  const [{ data: ob }, { data: rec }] = await Promise.all([
    db.from("modelo_onboarding").select("datos").eq("modelo_id", modeloId).maybeSingle(),
    db.from("posts_programados").select("caption").eq("modelo_id", modeloId).not("caption", "is", null).order("created_at", { ascending: false }).limit(8),
  ]);
  return { persona: personaDe(ob?.datos ? (sanearDatos(ob.datos) as unknown as Record<string, unknown>) : null), recientes: (rec ?? []).map((r) => r.caption as string).filter(Boolean) };
}

export async function captionDeArchivo(db: Db, modeloId: string, archivo: { storage_key: string; bucket: string }, minis: Set<string>): Promise<ResultadoCaption> {
  const b64 = await imagenBase64(db, archivo, minis);
  if (!b64) return { ok: false, motivo: "error", detalle: "No se pudo leer la foto" };
  return generarCaption({ imagenBase64: b64, ...(await contextoCaption(db, modeloId)) });
}

/**
 * Convierte en posts las fotos nuevas de la carpeta «Posts» de una modelo (maximo `limite` por llamada): cada una recibe un caption de la IA
 * (si puede) y el siguiente hueco de publicacion. Devuelve cuantas creo y cuantas faltan.
 */
export async function prepararPosts(db: Db, modeloId: string, limite = 6) {
  const { data: cols } = await db.from("of_colecciones").select("id").eq("modelo_id", modeloId).eq("tipo", "post");
  const colIds = (cols ?? []).map((c) => c.id as string);
  if (!colIds.length) return { creados: 0, restantes: 0 };
  const [{ data: fotos }, { data: ya }, { data: modelo }, { data: ult }] = await Promise.all([
    db.from("of_archivos").select("id, storage_key, bucket, created_at").eq("modelo_id", modeloId).eq("tipo_archivo", "foto").in("coleccion_id", colIds).order("created_at", { ascending: true }).limit(2000),
    db.from("posts_programados").select("archivo_id").eq("modelo_id", modeloId),
    db.from("modelos").select("posts_cada_dias").eq("id", modeloId).maybeSingle(),
    db.from("posts_programados").select("programar_para").eq("modelo_id", modeloId).neq("estado", "descartado").not("programar_para", "is", null).order("programar_para", { ascending: false }).limit(1),
  ]);
  const hechos = new Set((ya ?? []).map((r) => r.archivo_id as string));
  const nuevas = (fotos ?? []).filter((f) => !hechos.has(f.id as string));
  const lote = nuevas.slice(0, limite);
  if (!lote.length) return { creados: 0, restantes: 0 };

  const minis = await miniaturasDeModelo(modeloId);
  const huecos = proximosHuecos(modeloId, ult?.[0]?.programar_para ? new Date(ult[0].programar_para as string) : null, Number(modelo?.posts_cada_dias ?? 1), lote.length);
  let creados = 0;
  for (const [i, f] of lote.entries()) {
    const r = await captionDeArchivo(db, modeloId, { storage_key: f.storage_key as string, bucket: f.bucket as string }, minis);
    const { error } = await db.from("posts_programados").insert({
      modelo_id: modeloId,
      archivo_id: f.id,
      caption: r.ok ? r.caption : null,
      caption_motivo: r.ok ? null : r.motivo === "error" ? `error: ${r.detalle ?? ""}`.slice(0, 200) : r.motivo,
      programar_para: huecos[i].toISOString(),
    });
    if (!error) creados++;
  }
  return { creados, restantes: Math.max(0, nuevas.length - lote.length) };
}
