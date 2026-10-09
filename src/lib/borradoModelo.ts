import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { borrarDeR2, listarClavesR2 } from "@/lib/r2";
import { borrarObjetoOF, bucketOF } from "@/lib/r2/onlyfans";

// Todos los ARCHIVOS de una modelo (vídeos originales y editados, vistas previas, OnlyFans, virales propios, foto), para
// borrarlos del almacén cuando se elimina para siempre y que no ocupen espacio. Solo se tocan rutas que llevan el id de la
// modelo (o que salen de sus propias filas): nunca carpetas compartidas como "referencias/".

export type Inventario = { r2: Map<string, Set<string>>; supabase: Map<string, Set<string>> }; // bucket -> claves

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bucketR2 = () => process.env.R2_BUCKET_NAME ?? "halo-videos";
const baseUrl = () => (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

function anadir(m: Map<string, Set<string>>, bucket: string, clave: string) {
  const s = m.get(bucket) ?? new Set<string>();
  s.add(clave);
  m.set(bucket, s);
}

/** Clasifica un valor guardado (clave de R2, "supabase://bucket/ruta" o URL publica de R2) y lo apunta en el inventario. */
function registrar(inv: Inventario, valor: unknown, bucketR2Fila?: string) {
  if (typeof valor !== "string" || !valor) return;
  if (valor.startsWith("supabase://")) {
    const sin = valor.slice("supabase://".length);
    const i = sin.indexOf("/");
    if (i > 0) anadir(inv.supabase, sin.slice(0, i), sin.slice(i + 1));
    return;
  }
  let clave: string | null = valor;
  if (/^https?:\/\//i.test(valor)) {
    const base = baseUrl();
    clave = base && valor.startsWith(`${base}/`) ? decodeURI(valor.slice(base.length + 1)).split("?")[0] : null; // URLs de otros sitios no son nuestras
  }
  if (!clave || clave.startsWith("referencias/") || clave.includes("..")) return; // las referencias se comparten entre modelos
  anadir(inv.r2, bucketR2Fila ?? bucketR2(), clave);
}

async function listarStorage(bucket: string, carpeta: string): Promise<string[]> {
  const db = createAdminClient();
  const rutas: string[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(carpeta, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const f of data) if (f.name) rutas.push(`${carpeta}/${f.name}`);
    if (data.length < 1000) break;
  }
  return rutas;
}

/** Reune todo lo que hay que borrar de una modelo. */
export async function inventarioDeModelo(modeloId: string): Promise<Inventario> {
  if (!UUID.test(modeloId)) throw new Error("Id de modelo no valido");
  const db = createAdminClient();
  const inv: Inventario = { r2: new Map(), supabase: new Map() };

  const [piezas, of, virales] = await Promise.all([
    db.from("library_content").select("id, r2_key, r2_key_original, r2_key_referencia, video_procesado_url, r2_url, audio_referencia_url").eq("modelo_id", modeloId).limit(20000),
    db.from("of_archivos").select("storage_key, bucket").eq("modelo_id", modeloId).limit(100000),
    db.from("virales_propios").select("video_key, thumbnail_url").eq("modelo_id", modeloId).limit(20000),
  ]);

  for (const p of piezas.data ?? []) {
    for (const k of [p.r2_key, p.r2_key_original, p.r2_key_referencia, p.video_procesado_url, p.r2_url, p.audio_referencia_url]) registrar(inv, k);
    // Vistas previas de los originales (el runner las guarda como previews/<hash>.jpg|mp4)
    for (const k of new Set([p.r2_key_original ?? p.r2_key, p.r2_key].filter(Boolean) as string[])) {
      const h = createHash("sha1").update(k).digest("hex").slice(0, 20);
      anadir(inv.r2, bucketR2(), `previews/${h}.jpg`);
      anadir(inv.r2, bucketR2(), `previews/${h}.mp4`);
    }
  }
  for (const a of of.data ?? []) if (a.storage_key) anadir(inv.r2, a.bucket || bucketOF(), a.storage_key as string);
  for (const v of virales.data ?? []) {
    registrar(inv, v.video_key);
    registrar(inv, v.thumbnail_url);
  }

  // Barridos por carpeta de la modelo (por si queda algo subido a medias que no llego a registrarse)
  const barridos: Array<[string, string]> = [
    [bucketR2(), `bruto/${modeloId}/`],
    [bucketR2(), `procesadas/${modeloId}/`],
    [bucketOF(), `onlyfans/${modeloId}/`],
    [bucketOF(), `historias/${modeloId}/`], // fotos de historias de Instagram
  ];
  const listas = await Promise.all(barridos.map(([b, p]) => listarClavesR2(p, 200000, b).then((ks) => [b, ks] as const).catch(() => [b, [] as string[]] as const)));
  for (const [b, ks] of listas) for (const k of ks) anadir(inv.r2, b, k);

  anadir(inv.supabase, "fotos-modelos", modeloId); // la foto de perfil se llama como la modelo (si no existe, borrarla no hace nada)
  const subidas = await listarStorage("portal-uploads", modeloId).catch(() => []);
  for (const r of subidas) anadir(inv.supabase, "portal-uploads", r);

  return inv;
}

export const contarArchivos = (inv: Inventario) =>
  [...inv.r2.values(), ...inv.supabase.values()].reduce((s, set) => s + set.size, 0);

/** Borra el inventario. Devuelve cuantos archivos se pidieron borrar y los fallos (borrar lo que ya no existe no es un fallo). */
export async function borrarInventario(inv: Inventario): Promise<{ total: number; fallos: string[] }> {
  const fallos: string[] = [];
  const tareasR2: Array<() => Promise<void>> = [];
  for (const [bucket, claves] of inv.r2) {
    for (const k of claves) {
      tareasR2.push(async () => {
        try {
          if (bucket === bucketR2()) await borrarDeR2(k, bucket);
          else await borrarObjetoOF(k, bucket);
        } catch (e) {
          fallos.push(`${bucket}/${k}: ${e instanceof Error ? e.message : "error"}`);
        }
      });
    }
  }
  // En tandas de 16 a la vez
  for (let i = 0; i < tareasR2.length; i += 16) await Promise.all(tareasR2.slice(i, i + 16).map((t) => t()));

  const db = createAdminClient();
  for (const [bucket, rutas] of inv.supabase) {
    const lista = [...rutas];
    for (let i = 0; i < lista.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(lista.slice(i, i + 100));
      if (error) fallos.push(`${bucket}: ${error.message}`);
    }
  }
  return { total: contarArchivos(inv), fallos };
}
