import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ES_ORIGINAL = /^(bruto\/|supabase:\/\/portal-uploads\/)/;

type Pieza = {
  id: string;
  modelo_id: string | null;
  cuenta_id: string | null;
  r2_bucket: string | null;
  r2_key: string | null;
  r2_key_original: string | null;
  r2_key_referencia: string | null;
  tipo: number | null;
  tipo_video: string | null;
  mimetype: string | null;
  size_bytes: number | null;
  titulo: string | null;
  filename_original: string | null;
  recibido_at: string;
  estado: string;
  estado_procesamiento: string | null;
  notas_editor: string | null;
  original_borrado_at?: string | null;
};
const COLUMNAS = "id, modelo_id, cuenta_id, r2_bucket, r2_key, r2_key_original, r2_key_referencia, tipo, tipo_video, mimetype, size_bytes, titulo, filename_original, recibido_at, estado, estado_procesamiento, notas_editor";

// POST /api/originales/trial   { ids: [<library_content.id de cada original>], cantidad: 1-3 }
// Crea trial reels a partir del ARCHIVO ORIGINAL (bruto) de esos videos, tengan el estado que tengan: por cada original se abre una edicion NUEVA
// (la pieza que ya existe no se toca: puede estar aprobada o publicada) y, cuando el editor la termina, el video editado pasa a ser el original de
// Trial reels y se generan sus versiones (runner/src/queue.mjs + subidas_trial.mjs). No pasa por Aprobacion.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { ids?: unknown; cantidad?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? [...new Set((b.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "Elige al menos un original" }, { status: 400 });
  const cantidad = Math.min(3, Math.max(1, Math.round(Number(b?.cantidad)) || 3));

  const db = createAdminClient();
  const alcance = await alcanceActual();
  // 1) Las piezas elegidas (solo las que esta persona puede ver) y su archivo original
  const { data: elegidas } = await soloVisibles(db.from("library_content").select(`${COLUMNAS}, original_borrado_at`).in("id", ids), alcance);
  let lista = (elegidas ?? []) as Pieza[];
  if (!lista.length) {
    // Antes del SQL 20261007 la columna original_borrado_at no existe
    const r = await soloVisibles(db.from("library_content").select(COLUMNAS).in("id", ids), alcance);
    lista = (r.data ?? []) as Pieza[];
  }
  if (!lista.length) return NextResponse.json({ error: "No se encontraron esos vídeos" }, { status: 404 });

  const claveDe = (p: Pieza) => p.r2_key_original ?? p.r2_key;
  const claves = [...new Set(lista.map(claveDe).filter((k): k is string => Boolean(k) && ES_ORIGINAL.test(k as string)))];
  if (!claves.length) return NextResponse.json({ error: "Esos vídeos ya no tienen el archivo original guardado" }, { status: 404 });

  // 2) Todas las piezas que salen de cada original: la mas antigua es la subida de la modelo (de ella se copian los datos)
  const [a, c] = await Promise.all([db.from("library_content").select(COLUMNAS).in("r2_key", claves), db.from("library_content").select(COLUMNAS).in("r2_key_original", claves)]);
  const grupos = new Map<string, Pieza[]>();
  for (const p of [...(a.data ?? []), ...(c.data ?? [])] as Pieza[]) {
    for (const k of [p.r2_key_original, p.r2_key]) {
      if (k && claves.includes(k)) {
        const g = grupos.get(k) ?? [];
        if (!g.some((x) => x.id === p.id)) g.push(p);
        grupos.set(k, g);
      }
    }
  }

  // 3) Cuenta de Instagram de cada modelo (la del video o la principal / primera activa)
  const modelos = [...new Set(lista.map((p) => p.modelo_id).filter((m): m is string => Boolean(m)))];
  const cuentaDe = new Map<string, string>();
  if (modelos.length) {
    const { data: cuentas } = await db.from("cuentas_instagram").select("id, modelo_id, tipo").in("modelo_id", modelos).eq("activa", true);
    for (const cu of (cuentas ?? []) as Array<{ id: string; modelo_id: string; tipo: string | null }>) if (!cuentaDe.has(cu.modelo_id) || cu.tipo === "principal") cuentaDe.set(cu.modelo_id, cu.id);
  }

  const ahora = new Date().toISOString();
  const resumen = { creados: 0, sinOriginal: 0, sinCuenta: 0, tiktok: 0, yaEnMarcha: 0 };
  const hechos = new Set<string>();
  for (const p of lista) {
    const clave = claveDe(p);
    if (!clave || !ES_ORIGINAL.test(clave) || p.original_borrado_at) {
      resumen.sinOriginal++;
      continue;
    }
    if (hechos.has(clave)) continue; // dos tarjetas del mismo original: una sola edicion
    hechos.add(clave);
    const grupo = (grupos.get(clave) ?? [p]).sort((x, y) => x.recibido_at.localeCompare(y.recibido_at));
    const base = grupo[0];
    if (base.tipo === 3 || base.tipo === 5 || p.tipo === 3 || p.tipo === 5) {
      resumen.tiktok++; // los TikTok no se editan
      continue;
    }
    if (grupo.some((x) => x.estado === "editando" && /\[trial=\d\]/.test(x.notas_editor ?? ""))) {
      resumen.yaEnMarcha++; // ya se esta creando su trial
      continue;
    }
    const cuenta = base.cuenta_id ?? (base.modelo_id ? cuentaDe.get(base.modelo_id) : null) ?? null;
    if (!cuenta) {
      resumen.sinCuenta++;
      continue;
    }
    const { error } = await db.from("library_content").insert({
      modelo_id: base.modelo_id,
      cuenta_id: cuenta,
      origen: "upload_manual",
      r2_bucket: base.r2_bucket ?? process.env.R2_BUCKET_NAME ?? "halo-videos",
      r2_key: clave,
      r2_key_referencia: base.r2_key_referencia,
      filename_original: base.filename_original,
      mimetype: base.mimetype ?? "video/mp4",
      size_bytes: base.size_bytes,
      titulo: base.titulo ?? base.filename_original ?? "Vídeo",
      tipo: base.tipo,
      tipo_video: base.tipo_video,
      estado: "editando",
      estado_procesamiento: "pendiente",
      recibido_at: base.recibido_at,
      reparto_at: ahora,
      frase_quemada: "", // si es de frases con musica, el editor la elige al editar
      layout_json: null,
      notas_editor: `[trial=${cantidad}]`,
      caption: "",
      correcciones: "",
    });
    if (error) return NextResponse.json({ error: error.message, ...resumen }, { status: 500 });
    resumen.creados++;
  }
  if (!resumen.creados) {
    const motivo = resumen.yaEnMarcha ? "Esos vídeos ya se están preparando para trial reels" : resumen.sinCuenta ? "Esas modelos no tienen una cuenta de Instagram activa: los trial reels necesitan una" : resumen.tiktok ? "Los TikTok no se editan, así que no se pueden usar para trial reels" : "Esos vídeos ya no tienen el archivo original guardado";
    return NextResponse.json({ error: motivo, ...resumen }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...resumen, cantidad });
}
