import { createHash } from "crypto";
import { PanelLayout } from "@/components/PanelLayout";
import { listarClavesR2 } from "@/lib/r2";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { tipoVideoEfectivo } from "@/lib/tipoVideo";
import { OriginalesClient, type Original, type PiezaDeOriginal } from "./OriginalesClient";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

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
  original_borrado_at?: string | null;
  modelo?: { nombre?: string | null } | null;
};

const baseR2 = (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

// Mismo calculo que el runner (runner/src/previews.mjs): previews/<hash>.jpg|mp4
const hashOriginal = (clave: string) => createHash("sha1").update(clave).digest("hex").slice(0, 20);

// Hashes de los originales que ya tienen vista previa (el runner las genera: miniatura + copia ligera H.264).
async function vistasPreviasListas(): Promise<Set<string>> {
  try {
    const claves = await listarClavesR2("previews/");
    return new Set(claves.filter((k) => k.endsWith(".mp4")).map((k) => k.slice("previews/".length, -4)));
  } catch {
    return new Set();
  }
}

// Cada video que sube una modelo se guarda tal cual lo grabo (almacen privado) y NUNCA se borra: aqui estan
// todos, con su estado, para poder verlos y descargarlos y editarlos a mano si la edicion automatica falla.
async function cargar(): Promise<Original[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    const columnas = "id, modelo_id, titulo, filename_original, size_bytes, recibido_at, estado, estado_procesamiento, error_mensaje, tipo_video, tipo, r2_key, r2_key_original, video_procesado_url, recorte_inicio, modelo:modelos(nombre)";
    const consulta = (extra: string) =>
      soloVisibles(
        supabase
          .from("library_content")
          .select(`${columnas}${extra}`)
          .eq("origen", "upload_manual")
          .or("tipo.is.null,tipo.neq.5")
          .order("recibido_at", { ascending: false })
          .limit(1500),
        alcance,
      );
    // original_borrado_at la crea el SQL 20261007; mientras no exista se lista sin ella.
    const [primera, fotos, previews] = await Promise.all([consulta(", original_borrado_at"), versionesFotos(), vistasPreviasListas()]);
    const { data, error } = primera.error ? await consulta("") : primera;
    if (error) return [];

    // Varias piezas pueden salir del mismo original (frase con musica: un original largo se parte en
    // fragmentos, y "rehacer" crea otra pieza): se agrupan por el archivo original.
    const grupos = new Map<string, Fila[]>();
    for (const f of (data ?? []) as unknown as Fila[]) {
      if (f.original_borrado_at) continue; // original ya borrado a mano
      const clave = f.r2_key_original ?? f.r2_key;
      if (!clave) continue;
      grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
    }

    return [...grupos.values()].slice(0, 300).map((piezas) => {
      const primera = piezas[0];
      const ultima = piezas[piezas.length - 1]; // la mas antigua = la subida original
      const claveOriginal = (primera.r2_key_original ?? primera.r2_key) as string;
      const h = hashOriginal(claveOriginal);
      return {
        id: primera.id,
        modelo_id: primera.modelo_id,
        modelo_nombre: primera.modelo?.nombre ?? "—",
        foto: primera.modelo_id ? (fotos[primera.modelo_id] ?? null) : null,
        archivo: ultima.filename_original ?? primera.titulo ?? "video",
        tamano: ultima.size_bytes ?? null,
        recibido_at: ultima.recibido_at,
        preview: previews.has(h) && baseR2 ? { poster: `${baseR2}/previews/${h}.jpg`, video: `${baseR2}/previews/${h}.mp4` } : null,
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
