// «Vídeos al día»: una modelo marcada así (las nuevas, al firmar el contrato) recibe automaticamente en su portal los ULTIMOS 40 videos que se hayan
// asignado a las demas modelos y, a partir de ahi, cada video nuevo que se les asigne. El trabajo lo hace el editor (runner/src/espejo.mjs) cada minuto;
// aqui solo se apunta quien esta en la lista. Vive en panel_config (clave modelos_espejo), con «comparar y cambiar» para no pisarse.
import { createAdminClient } from "@/lib/supabase/server";

export const CLAVE_ESPEJO = "modelos_espejo";
export const ULTIMOS_VIDEOS = 40;

/** desde = hasta que asignacion ya se ha copiado (null = aun no); inicial = falta copiar los ultimos 40. */
export type EntradaEspejo = { id: string; desde: string | null; inicial: boolean };

async function leer(): Promise<{ entradas: EntradaEspejo[]; updated_at: string | null }> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", CLAVE_ESPEJO).maybeSingle();
  const v = data?.value as { modelos?: EntradaEspejo[] } | null | undefined;
  return { entradas: Array.isArray(v?.modelos) ? v.modelos : [], updated_at: (data?.updated_at as string | undefined) ?? null };
}

async function cambiar(fn: (e: EntradaEspejo[]) => EntradaEspejo[] | null): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { entradas, updated_at } = await leer();
    const nuevas = fn(entradas);
    if (nuevas === null) return true; // nada que cambiar
    const valor = { modelos: nuevas };
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await db.from("panel_config").insert({ key: CLAVE_ESPEJO, value: valor, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data, error } = await db.from("panel_config").update({ value: valor, updated_at: ahora }).eq("key", CLAVE_ESPEJO).eq("updated_at", updated_at).select("key");
      if (!error && data?.length) return true;
    }
  }
  return false;
}

export async function enEspejo(modeloId: string): Promise<boolean> {
  try {
    return (await leer()).entradas.some((e) => e.id === modeloId);
  } catch {
    return false;
  }
}

/** Apunta a la modelo: en menos de un minuto tendra los ultimos 40 videos asignados a las demas, y despues los nuevos. */
export async function registrarEspejo(modeloId: string): Promise<boolean> {
  return cambiar((l) => (l.some((e) => e.id === modeloId) ? null : [...l, { id: modeloId, desde: null, inicial: true }]));
}

export async function quitarEspejo(modeloId: string): Promise<boolean> {
  return cambiar((l) => (l.some((e) => e.id === modeloId) ? l.filter((e) => e.id !== modeloId) : null));
}
