import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { progresoScript, type ArchivoOF, type ColeccionOF } from "@/lib/onlyfans";
import { OnlyFansClient, type ResumenColeccion } from "./OnlyFansClient";

export const dynamic = "force-dynamic";

type ArchivoMeta = Pick<ArchivoOF, "id" | "coleccion_id" | "fase" | "slot" | "tipo_archivo" | "orden" | "size_bytes" | "descargado_at" | "subido_of_at" | "nombre_original" | "mime" | "duracion_seg" | "created_at">;

async function cargar() {
  if (!canUseSupabase()) return { listo: false, modelos: [], resumen: [] as ResumenColeccion[] };
  try {
    const supabase = createAdminClient();
    const [cols, arcs, mods, fotos] = await Promise.all([
      supabase.from("of_colecciones").select("*").order("created_at", { ascending: false }).limit(3000),
      supabase.from("of_archivos").select("id, coleccion_id, fase, slot, tipo_archivo, orden, size_bytes, descargado_at, subido_of_at, nombre_original, mime, duracion_seg, created_at").limit(50000),
      supabase.from("modelos").select("id, nombre").order("nombre"),
      versionesFotos(),
    ]);
    if (cols.error || arcs.error) return { listo: false, modelos: [], resumen: [] as ResumenColeccion[] };

    const porColeccion = new Map<string, ArchivoMeta[]>();
    for (const a of (arcs.data ?? []) as ArchivoMeta[]) porColeccion.set(a.coleccion_id, [...(porColeccion.get(a.coleccion_id) ?? []), a]);
    const nombrePorId = new Map((mods.data ?? []).map((m) => [m.id as string, m.nombre as string]));

    const resumen: ResumenColeccion[] = ((cols.data ?? []) as ColeccionOF[]).map((c) => {
      const as = porColeccion.get(c.id) ?? [];
      const pr = c.tipo === "script" ? progresoScript(as as ArchivoOF[]) : null;
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
      };
    });
    const modelos = (mods.data ?? []).map((m) => ({ id: m.id as string, nombre: m.nombre as string, foto: fotos[m.id as string] ?? null }));
    return { listo: true, modelos, resumen };
  } catch {
    return { listo: false, modelos: [], resumen: [] as ResumenColeccion[] };
  }
}

export default async function OnlyFansPage() {
  const { listo, modelos, resumen } = await cargar();
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Scripts, packs y posts de cada modelo, ordenados</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">OnlyFans</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Las modelos lo suben desde su portal (pestaña «Contenido») por fases, y aquí lo tienes listo para descargar tal cual lo grabaron, sin perder calidad.
        </p>
      </div>
      {listo ? (
        <OnlyFansClient modelos={modelos} colecciones={resumen} />
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200">
          Falta activar esta sección: ejecuta el SQL <code>20261008_onlyfans_contenido.sql</code> en el SQL Editor de Supabase y recarga.
        </div>
      )}
    </PanelLayout>
  );
}
