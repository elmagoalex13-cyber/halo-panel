import { createAdminClient } from "@/lib/supabase/server";
import { cargarBanco, elegirCaption } from "@/lib/postsCaptionBanco";
import { proximosHuecos } from "@/lib/postsHorarios";

type Db = ReturnType<typeof createAdminClient>;

/** ¿Tiene esta modelo un perfil activo en Venuz? (cuenta de Venuz vinculada y activa). */
export async function cuentaVenuzActiva(db: Db, modeloId: string): Promise<{ id: string; nombre: string } | null> {
  const { data } = await db.from("venuz_cuentas").select("id, nombre").eq("modelo_id", modeloId).eq("activa", true).limit(1).maybeSingle();
  return data ? { id: data.id as string, nombre: data.nombre as string } : null;
}

/** Rellena con un caption del banco los posts por revisar que no tienen. Devuelve cuantos relleno (0 si no hay banco). */
export async function rellenarCaptions(db: Db, modeloId: string): Promise<number> {
  const { data: vacios } = await db.from("posts_programados").select("id").eq("modelo_id", modeloId).eq("estado", "borrador").is("caption", null).order("programar_para", { ascending: true }).limit(200);
  if (!vacios?.length) return 0;
  const ctx = await cargarBanco(db, modeloId);
  if (!ctx) return 0;
  let n = 0;
  for (const v of vacios) {
    const c = elegirCaption(ctx);
    if (!c) break;
    const { error } = await db.from("posts_programados").update({ caption: c, caption_motivo: null, updated_at: new Date().toISOString() }).eq("id", v.id);
    if (!error) n++;
  }
  return n;
}

/**
 * Convierte en posts las fotos nuevas de la carpeta «Posts» de una modelo (maximo `limite` por llamada): cada una recibe un caption del banco y el siguiente hueco de publicacion. Devuelve cuantas creo y cuantas faltan.
 */
export async function prepararPosts(db: Db, modeloId: string, limite = 60) {
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

  const ctx = await cargarBanco(db, modeloId);
  const huecos = proximosHuecos(modeloId, ult?.[0]?.programar_para ? new Date(ult[0].programar_para as string) : null, Number(modelo?.posts_cada_dias ?? 1), lote.length);
  let creados = 0;
  for (const [i, f] of lote.entries()) {
    const caption = ctx ? elegirCaption(ctx) : null;
    const { error } = await db.from("posts_programados").insert({
      modelo_id: modeloId,
      archivo_id: f.id,
      caption,
      programar_para: huecos[i].toISOString(),
    });
    if (!error) creados++;
  }
  return { creados, restantes: Math.max(0, nuevas.length - lote.length) };
}
