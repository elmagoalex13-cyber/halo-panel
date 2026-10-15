// «Vídeos de bienvenida»: UNA SOLA VEZ, una hora despues de firmar el contrato, a la modelo nueva se le asignan en su portal los ULTIMOS 40 videos que se hayan
// asignado a las demas modelos EN ESE MOMENTO. Despues no se le copia nada mas (lo que se asigne luego a otras no le llega). El trabajo lo hace el editor
// (runner/src/espejo.mjs); aqui solo se apunta a la modelo y la hora a la que le toca. Vive en panel_config (clave modelos_espejo) con «comparar y cambiar».
import { createAdminClient } from "@/lib/supabase/server";

export const CLAVE_ESPEJO = "modelos_espejo";
export const ULTIMOS_VIDEOS = 40;
export const RETRASO_MIN = 60; // una hora despues de firmar

/** due = cuando le toca; hecho_at / n = cuando se le asignaron y cuantos (cuando ya esta hecho). */
export type EntradaEspejo = { id: string; due: string; hecho_at?: string | null; n?: number | null };
export type EstadoEspejo = { estado: "pendiente" | "hecho" | null; due?: string; hecho_at?: string | null; n?: number | null };

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

export async function estadoEspejo(modeloId: string): Promise<EstadoEspejo> {
  try {
    const e = (await leer()).entradas.find((x) => x.id === modeloId);
    if (!e) return { estado: null };
    return e.hecho_at ? { estado: "hecho", due: e.due, hecho_at: e.hecho_at, n: e.n ?? null } : { estado: "pendiente", due: e.due };
  } catch {
    return { estado: null };
  }
}

/** Apunta a la modelo: pasados `minutos`, se le asignan los ultimos 40 videos asignados a las demas (una sola vez). Si ya estaba apuntada y hecha, se vuelve a programar. */
export async function registrarEspejo(modeloId: string, minutos = RETRASO_MIN): Promise<boolean> {
  const due = new Date(Date.now() + minutos * 60000).toISOString();
  return cambiar((l) => [...l.filter((e) => e.id !== modeloId), { id: modeloId, due }]);
}

/** Cancela lo pendiente (no toca lo que ya se le asigno). */
export async function quitarEspejo(modeloId: string): Promise<boolean> {
  return cambiar((l) => (l.some((e) => e.id === modeloId && !e.hecho_at) ? l.filter((e) => !(e.id === modeloId && !e.hecho_at)) : null));
}
