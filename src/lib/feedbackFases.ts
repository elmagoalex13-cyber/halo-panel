// Feedback de la agencia POR FASE de un script (cada fase puede estar «bien» o «a mejorar», con su comentario). Se guarda en panel_config
// (clave of_feedback_fases:<coleccion>) con «comparar y cambiar»; la modelo lo ve dentro de cada fase en su portal.
import { createAdminClient } from "@/lib/supabase/server";

import type { FeedbackFase, FeedbackFases } from "@/lib/feedbackFasesTipos";
export type { FeedbackFase, FeedbackFases, EstadoFase } from "@/lib/feedbackFasesTipos";
export { estadoFase } from "@/lib/feedbackFasesTipos";

const clave = (coleccionId: string) => `of_feedback_fases:${coleccionId}`;

export async function leerFeedbackFases(coleccionId: string): Promise<FeedbackFases> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", clave(coleccionId)).maybeSingle();
    return ((data?.value as FeedbackFases | null) ?? {}) as FeedbackFases;
  } catch {
    return {};
  }
}

/** El feedback por fase de varios scripts de una vez. */
export async function leerFeedbackFasesDe(ids: string[]): Promise<Record<string, FeedbackFases>> {
  const salida: Record<string, FeedbackFases> = {};
  if (!ids.length) return salida;
  try {
    const { data } = await createAdminClient().from("panel_config").select("key, value").in("key", ids.map(clave));
    for (const f of data ?? []) salida[String(f.key).slice("of_feedback_fases:".length)] = (f.value as FeedbackFases | null) ?? {};
  } catch {
    /* sin feedback */
  }
  return salida;
}

/** Guarda (o quita, con null) el feedback de una fase. */
export async function guardarFeedbackFase(coleccionId: string, fase: number, fb: FeedbackFase | null): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("panel_config").select("value, updated_at").eq("key", clave(coleccionId)).maybeSingle();
    const actual = ((data?.value as FeedbackFases | null) ?? {}) as FeedbackFases;
    const nuevo: FeedbackFases = { ...actual };
    if (fb) nuevo[String(fase)] = fb;
    else delete nuevo[String(fase)];
    const ahora = new Date().toISOString();
    if (!data) {
      const { error } = await db.from("panel_config").insert({ key: clave(coleccionId), value: nuevo, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data: ok, error } = await db.from("panel_config").update({ value: nuevo, updated_at: ahora }).eq("key", clave(coleccionId)).eq("updated_at", data.updated_at).select("key");
      if (!error && ok?.length) return true;
    }
  }
  return false;
}
