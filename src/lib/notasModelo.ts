// Anotaciones internas de cada modelo (las ven y las escriben los dos: tu socio y tu): grupos de WhatsApp, cosas a tener en cuenta, acuerdos...
// Se guardan en panel_config (clave notas_modelo:<id>, sin tabla nueva). Las escrituras usan «comparar y cambiar» (updated_at) para que dos
// personas anotando a la vez no se pisen.
import { createAdminClient } from "@/lib/supabase/server";

export type NotaModelo = { id: string; texto: string; autor: string; creada: string; editada?: string; fijada?: boolean };

export const claveNotas = (modeloId: string) => `notas_modelo:${modeloId}`;
const MAX_NOTAS = 300;

export async function leerNotas(modeloId: string): Promise<{ notas: NotaModelo[]; updated_at: string | null }> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", claveNotas(modeloId)).maybeSingle();
  const v = data?.value as { notas?: NotaModelo[] } | null | undefined;
  return { notas: Array.isArray(v?.notas) ? v.notas : [], updated_at: (data?.updated_at as string | undefined) ?? null };
}

/** Aplica un cambio a la lista de notas y lo guarda; si alguien guardo a la vez, vuelve a leer y reintenta. */
export async function cambiarNotas(modeloId: string, cambio: (notas: NotaModelo[]) => NotaModelo[] | null): Promise<NotaModelo[] | null> {
  const db = createAdminClient();
  for (let intento = 0; intento < 5; intento++) {
    const { notas, updated_at } = await leerNotas(modeloId);
    const nuevas = cambio(notas);
    if (nuevas === null) return null; // nada que cambiar (la nota ya no existe)
    const ahora = new Date().toISOString();
    const valor = { notas: nuevas.slice(0, MAX_NOTAS) };
    if (!updated_at) {
      const { error } = await db.from("panel_config").insert({ key: claveNotas(modeloId), value: valor, updated_at: ahora });
      if (!error) return valor.notas;
    } else {
      const { data, error } = await db.from("panel_config").update({ value: valor, updated_at: ahora }).eq("key", claveNotas(modeloId)).eq("updated_at", updated_at).select("key");
      if (!error && data?.length) return valor.notas;
    }
  }
  throw new Error("No se pudo guardar la nota (otra persona estaba guardando a la vez). Inténtalo otra vez.");
}

/** Fijadas primero; dentro de cada grupo, las mas nuevas arriba. */
export const ordenarNotas = (notas: NotaModelo[]) => [...notas].sort((a, b) => Number(Boolean(b.fijada)) - Number(Boolean(a.fijada)) || b.creada.localeCompare(a.creada));
