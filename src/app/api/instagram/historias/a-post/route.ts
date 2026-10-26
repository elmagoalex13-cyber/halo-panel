import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { NOMBRE_HISTORIAS_POSTS } from "@/lib/onlyfans";
import { UUID, extensionSegura } from "@/lib/ofServer";
import { bucketOF, copiarObjetoOF, tamanoEnR2 } from "@/lib/r2/onlyfans";
import { prefijoHistorias } from "@/lib/historiasIG";
import { crearPosts, cuentaVenuzActiva } from "@/lib/postsOF";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

// POST { modelo_id, keys: string[] } -> pasa fotos de historias de Instagram (las que te gustan) a posts de OnlyFans.
// Se COPIA la foto (la historia sigue donde estaba) a una carpeta interna de la modelo y se crea un post por foto, con caption del banco
// y el siguiente hueco de publicacion; luego se revisan y se aprueban en Posts OF como cualquier otro. Cada historia solo se pasa una vez.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { modelo_id?: string; keys?: unknown } | null;
  const modeloId = String(b?.modelo_id ?? "");
  if (!UUID.test(modeloId)) return NextResponse.json({ error: "Modelo no válida" }, { status: 400 });
  const g = await exigirModelo(modeloId);
  if (g) return g;
  const keys = Array.isArray(b?.keys) ? [...new Set(b.keys.filter((k): k is string => typeof k === "string"))].slice(0, 60) : [];
  if (!keys.length || keys.some((k) => !k.startsWith(prefijoHistorias(modeloId)) || k.includes(".."))) return NextResponse.json({ error: "Fotos no válidas" }, { status: 400 });

  const db = createAdminClient();
  if (!(await cuentaVenuzActiva(db, modeloId))) return NextResponse.json({ error: "Esta modelo no tiene un perfil activo en Venuz, así que no se pueden programar posts para ella todavía." }, { status: 409 });

  // Carpeta interna (una por modelo)
  let { data: col } = await db.from("of_colecciones").select("id").eq("modelo_id", modeloId).eq("tipo", "post").eq("nombre", NOMBRE_HISTORIAS_POSTS).limit(1).maybeSingle();
  if (!col) {
    const { data: nueva, error } = await db.from("of_colecciones").insert({ modelo_id: modeloId, tipo: "post", nombre: NOMBRE_HISTORIAS_POSTS, visto_at: new Date().toISOString() }).select("id").single();
    if (error || !nueva) return NextResponse.json({ error: error?.message ?? "No se pudo preparar la carpeta" }, { status: 500 });
    col = nueva;
  }
  const colId = col.id as string;

  const { data: previos } = await db.from("of_archivos").select("nombre_original, orden").eq("coleccion_id", colId);
  const yaPasadas = new Set((previos ?? []).map((a) => a.nombre_original as string));
  let orden = Math.max(0, ...(previos ?? []).map((a) => Number(a.orden) || 0));

  const archivoIds: string[] = [];
  let saltadas = 0;
  const fallos: string[] = [];
  for (const key of keys) {
    const nombre = key.split("/").pop() ?? "historia.jpg";
    if (yaPasadas.has(nombre)) {
      saltadas++;
      continue;
    }
    const ext = extensionSegura(nombre, "foto");
    const destino = `onlyfans/${modeloId}/${colId}/${randomUUID()}.${ext}`;
    try {
      await copiarObjetoOF(key, destino);
      const size = await tamanoEnR2(destino);
      const { data, error } = await db
        .from("of_archivos")
        .insert({ coleccion_id: colId, modelo_id: modeloId, tipo_archivo: "foto", orden: ++orden, nombre_original: nombre, mime: MIME[ext] ?? "image/jpeg", size_bytes: size, bucket: bucketOF(), storage_key: destino })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "No se pudo guardar");
      archivoIds.push(data.id as string);
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : "Error");
    }
  }
  // Para que la carpeta interna no salte como «nueva» en el aviso de OnlyFans
  if (archivoIds.length) await db.from("of_colecciones").update({ visto_at: new Date().toISOString() }).eq("id", colId);

  const creados = await crearPosts(db, modeloId, archivoIds);
  if (!creados && fallos.length) return NextResponse.json({ error: `No se pudo pasar a posts: ${fallos[0]}` }, { status: 500 });
  return NextResponse.json({ ok: true, creados, saltadas, fallos: fallos.length });
}
