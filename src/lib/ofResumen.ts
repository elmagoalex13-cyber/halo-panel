import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { alcanceActual, soloVisibles } from "@/lib/alcance";
import { progresoScript, type ArchivoOF, type ColeccionOF, type TipoColeccion } from "@/lib/onlyfans";

export type ResumenColeccion = {
  id: string;
  modelo_id: string;
  modelo_nombre: string;
  tipo: TipoColeccion;
  nombre: string;
  estado: "en_curso" | "entregado";
  entregado_at: string | null;
  created_at: string;
  archivos: number;
  videos: number;
  fotos: number;
  bytes: number;
  sinDescargar: number;
  subidosOF: number;
  fasesCompletas: number | null;
  nuevo: boolean; // la modelo ha subido algo desde la ultima vez que lo abriste
};

type ArchivoMeta = Pick<ArchivoOF, "id" | "coleccion_id" | "fase" | "slot" | "tipo_archivo" | "orden" | "size_bytes" | "descargado_at" | "subido_of_at" | "nombre_original" | "mime" | "duracion_seg" | "created_at">;

/** Resumen de scripts/packs/posts (de una modelo o de todas) para las listas del panel. */
export async function cargarResumenOF(modeloId?: string) {
  const vacio = { listo: false, modelos: [] as Array<{ id: string; nombre: string; foto: number | null }>, resumen: [] as ResumenColeccion[] };
  if (!canUseSupabase()) return vacio;
  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    let qc = supabase.from("of_colecciones").select("*").order("created_at", { ascending: false }).limit(3000);
    let qa = supabase.from("of_archivos").select("id, coleccion_id, fase, slot, tipo_archivo, orden, size_bytes, descargado_at, subido_of_at, nombre_original, mime, duracion_seg, created_at").limit(50000);
    if (modeloId) {
      qc = qc.eq("modelo_id", modeloId);
      qa = qa.eq("modelo_id", modeloId);
    }
    const [cols, arcs, mods, fotos] = await Promise.all([
      soloVisibles(qc, alcance),
      soloVisibles(qa, alcance),
      soloVisibles(supabase.from("modelos").select("id, nombre").order("nombre"), alcance, "id"),
      versionesFotos(),
    ]);
    if (cols.error || arcs.error) return vacio;

    const porColeccion = new Map<string, ArchivoMeta[]>();
    for (const a of (arcs.data ?? []) as ArchivoMeta[]) porColeccion.set(a.coleccion_id, [...(porColeccion.get(a.coleccion_id) ?? []), a]);
    const nombrePorId = new Map((mods.data ?? []).map((m) => [m.id as string, m.nombre as string]));

    const resumen: ResumenColeccion[] = ((cols.data ?? []) as Array<ColeccionOF & { visto_at?: string | null }>).map((c) => {
      const as = porColeccion.get(c.id) ?? [];
      const pr = c.tipo === "script" ? progresoScript(as as ArchivoOF[]) : null;
      const ultimo = as.reduce((m, a) => (a.created_at > m ? a.created_at : m), "");
      return {
        id: c.id,
        modelo_id: c.modelo_id,
        modelo_nombre: nombrePorId.get(c.modelo_id) ?? "—",
        tipo: c.tipo,
        nombre: c.nombre,
        estado: c.estado,
        entregado_at: c.entregado_at,
        created_at: c.created_at,
        archivos: as.length,
        videos: as.filter((a) => a.tipo_archivo === "video").length,
        fotos: as.filter((a) => a.tipo_archivo === "foto").length,
        bytes: as.reduce((s, a) => s + (a.size_bytes ?? 0), 0),
        sinDescargar: as.filter((a) => !a.descargado_at).length,
        subidosOF: as.filter((a) => a.subido_of_at).length,
        fasesCompletas: pr?.fasesCompletas ?? null,
        nuevo: Boolean(ultimo) && (!c.visto_at || ultimo > c.visto_at),
      };
    });
    const modelos = (mods.data ?? [])
      .filter((m) => !modeloId || m.id === modeloId)
      .map((m) => ({ id: m.id as string, nombre: m.nombre as string, foto: fotos[m.id as string] ?? null }));
    return { listo: true, modelos, resumen };
  } catch {
    return vacio;
  }
}

/** Cuantos scripts/packs/posts tienen archivos que la modelo subio despues de la ultima vez que los abriste. */
export async function contarOFNuevo(): Promise<{ count: number; modelos: string[] }> {
  if (!canUseSupabase()) return { count: 0, modelos: [] };
  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    const desde = new Date(Date.now() - 120 * 86400000).toISOString();
    const [cols, arcs, mods] = await Promise.all([
      soloVisibles(supabase.from("of_colecciones").select("id, modelo_id, visto_at"), alcance),
      soloVisibles(supabase.from("of_archivos").select("coleccion_id, created_at, descargado_at").gte("created_at", desde).limit(20000), alcance),
      soloVisibles(supabase.from("modelos").select("id, nombre"), alcance, "id"),
    ]);
    const nombrePorId = new Map((mods.data ?? []).map((m) => [m.id as string, m.nombre as string]));

    // visto_at aun no existe (falta el SQL 20261009): se considera nuevo lo que no se ha descargado
    if (cols.error) {
      const sinVer = await soloVisibles(supabase.from("of_colecciones").select("id, modelo_id"), alcance);
      const idsNuevos = new Set((arcs.data ?? []).filter((a) => !a.descargado_at).map((a) => a.coleccion_id as string));
      const lista = (sinVer.data ?? []).filter((c) => idsNuevos.has(c.id as string));
      return { count: lista.length, modelos: Array.from(new Set(lista.map((c) => nombrePorId.get(c.modelo_id as string) ?? "").filter(Boolean))) };
    }

    const ultimo = new Map<string, string>();
    for (const a of arcs.data ?? []) {
      const id = a.coleccion_id as string;
      if (!ultimo.has(id) || (a.created_at as string) > (ultimo.get(id) as string)) ultimo.set(id, a.created_at as string);
    }
    const nuevas = (cols.data ?? []).filter((c) => {
      const u = ultimo.get(c.id as string);
      return u && (!c.visto_at || u > (c.visto_at as string));
    });
    return { count: nuevas.length, modelos: Array.from(new Set(nuevas.map((c) => nombrePorId.get(c.modelo_id as string) ?? "").filter(Boolean))) };
  } catch {
    return { count: 0, modelos: [] };
  }
}
