import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { listarClavesR2 } from "@/lib/r2";

// Reels de una modelo en fase de captacion que estan EN ESPERA (estado "recibido", sin editar) para que la agencia los revise,
// de feedback y decida cuantos mandar ya a edicion.

export type PiezaEnEspera = {
  id: string;
  titulo: string | null;
  archivo: string | null;
  recibido_at: string;
  size_bytes: number | null;
  tipo: number | null;
  preview: { poster: string; video: string } | null;
  feedback_tipo: "bien" | "mejorar" | null;
  feedback_texto: string | null;
};

const base = () => (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
const hash = (clave: string) => createHash("sha1").update(clave).digest("hex").slice(0, 20);

export async function piezasEnEspera(modeloId: string): Promise<{ piezas: PiezaEnEspera[]; enEdicion: number }> {
  const db = createAdminClient();
  const cols = "id, titulo, filename_original, recibido_at, size_bytes, tipo, r2_key, r2_key_original";
  const consulta = (extra: string) =>
    db.from("library_content").select(`${cols}${extra}`).eq("modelo_id", modeloId).eq("estado", "recibido").order("recibido_at", { ascending: false }).limit(300);

  let r = await consulta(", feedback_tipo, feedback_texto");
  if (r.error) r = await consulta(""); // aun sin el SQL 20261021
  const filas = (r.data ?? []) as unknown as Array<Record<string, unknown>>;

  // Que vistas previas ya existen (las genera el editor por cada original)
  let listas = new Set<string>();
  try {
    listas = new Set((await listarClavesR2("previews/", 50000)).filter((k) => k.endsWith(".mp4")).map((k) => k.slice("previews/".length, -4)));
  } catch {
    /* sin R2: se muestra sin vista previa */
  }
  const b = base();

  const { count } = await db
    .from("library_content")
    .select("id", { count: "exact", head: true })
    .eq("modelo_id", modeloId)
    .eq("origen", "upload_manual")
    .neq("estado", "recibido")
    .or("tipo.is.null,tipo.neq.5");

  return {
    enEdicion: count ?? 0,
    piezas: filas.map((f) => {
      const clave = String(f.r2_key_original ?? f.r2_key ?? "");
      const h = clave ? hash(clave) : "";
      return {
        id: String(f.id),
        titulo: (f.titulo as string | null) ?? null,
        archivo: (f.filename_original as string | null) ?? null,
        recibido_at: String(f.recibido_at),
        size_bytes: (f.size_bytes as number | null) ?? null,
        tipo: (f.tipo as number | null) ?? null,
        preview: h && b && listas.has(h) ? { poster: `${b}/previews/${h}.jpg`, video: `${b}/previews/${h}.mp4` } : null,
        feedback_tipo: f.feedback_tipo === "bien" || f.feedback_tipo === "mejorar" ? f.feedback_tipo : null,
        feedback_texto: (f.feedback_texto as string | null) ?? null,
      };
    }),
  };
}
