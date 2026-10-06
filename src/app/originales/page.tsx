import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { tipoVideoEfectivo } from "@/lib/tipoVideo";
import { OriginalesClient, type Original, type PiezaDeOriginal } from "./OriginalesClient";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  modelo_id: string | null;
  titulo: string | null;
  filename_original: string | null;
  size_bytes: number | null;
  recibido_at: string;
  estado: string;
  estado_procesamiento: string | null;
  error_mensaje: string | null;
  tipo_video: string | null;
  tipo: number | null;
  r2_key: string | null;
  r2_key_original: string | null;
  video_procesado_url: string | null;
  recorte_inicio: number | null;
  modelo?: { nombre?: string | null } | null;
};

// Cada video que sube una modelo se guarda tal cual lo grabo (almacen privado) y NUNCA se borra: aqui estan
// todos, con su estado, para poder verlos y descargarlos y editarlos a mano si la edicion automatica falla.
async function cargar(): Promise<Original[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const [{ data, error }, fotos] = await Promise.all([
      supabase
        .from("library_content")
        .select("id, modelo_id, titulo, filename_original, size_bytes, recibido_at, estado, estado_procesamiento, error_mensaje, tipo_video, tipo, r2_key, r2_key_original, video_procesado_url, recorte_inicio, modelo:modelos(nombre)")
        .eq("origen", "upload_manual")
        .or("tipo.is.null,tipo.neq.5")
        .order("recibido_at", { ascending: false })
        .limit(1500),
      versionesFotos(),
    ]);
    if (error) return [];

    // Varias piezas pueden salir del mismo original (frase con musica: un original largo se parte en
    // fragmentos, y "rehacer" crea otra pieza): se agrupan por el archivo original.
    const grupos = new Map<string, Fila[]>();
    for (const f of (data ?? []) as unknown as Fila[]) {
      const clave = f.r2_key_original ?? f.r2_key;
      if (!clave) continue;
      grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
    }

    return [...grupos.values()].slice(0, 300).map((piezas) => {
      const primera = piezas[0];
      const ultima = piezas[piezas.length - 1]; // la mas antigua = la subida original
      return {
        id: primera.id,
        modelo_id: primera.modelo_id,
        modelo_nombre: primera.modelo?.nombre ?? "—",
        foto: primera.modelo_id ? (fotos[primera.modelo_id] ?? null) : null,
        archivo: ultima.filename_original ?? primera.titulo ?? "video",
        tamano: ultima.size_bytes ?? null,
        recibido_at: ultima.recibido_at,
        piezas: piezas.map<PiezaDeOriginal>((p) => ({
          id: p.id,
          estado: p.estado,
          proceso: p.estado_procesamiento,
          error: p.error_mensaje,
          tipo: tipoVideoEfectivo(p.tipo_video, p.tipo),
          tieneEditado: Boolean(p.video_procesado_url),
          fragmento: p.recorte_inicio !== null ? p.recorte_inicio : null,
        })),
      };
    });
  } catch {
    return [];
  }
}

export default async function OriginalesPage() {
  const originales = await cargar();
  const modelos = Array.from(
    new Map(originales.filter((o) => o.modelo_id).map((o) => [o.modelo_id as string, { id: o.modelo_id as string, nombre: o.modelo_nombre, foto: o.foto }])).values(),
  ).sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Los videos tal cual los graban las modelos</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Originales</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Cada video que sube una modelo en su portal se guarda aquí sin tocar y no se borra nunca. Si la edición automática sale mal, descárgalo y edítalo a mano.
        </p>
      </div>
      <OriginalesClient originales={originales} modelos={modelos} />
    </PanelLayout>
  );
}
