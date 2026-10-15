// Notas internas de cada script/pack/post de OnlyFans (solo las ven tu socio y tu; la modelo NO las ve, a diferencia de la descripcion).
// Viven en panel_config (clave notas_of:<modelo_id>, un mapa coleccion -> nota) con «comparar y cambiar» (updated_at).
import { createAdminClient } from "@/lib/supabase/server";

export type NotaOF = { texto: string; autor: string; at: string };
export const claveNotasOF = (modeloId: string) => `notas_of:${modeloId}`;

async function leer(modeloId: string): Promise<{ notas: Record<string, NotaOF>; updated_at: string | null }> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", claveNotasOF(modeloId)).maybeSingle();
  const v = data?.value as { notas?: Record<string, NotaOF> } | null | undefined;
  return { notas: v?.notas && typeof v.notas === "object" ? v.notas : {}, updated_at: (data?.updated_at as string | undefined) ?? null };
}

/** Pone (o quita, con texto vacio) la nota de una coleccion. */
export async function guardarNotaOF(modeloId: string, coleccionId: string, texto: string, autor: string): Promise<NotaOF | null> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { notas, updated_at } = await leer(modeloId);
    const nuevas = { ...notas };
    const nota = texto ? { texto, autor, at: new Date().toISOString() } : null;
    if (nota) nuevas[coleccionId] = nota;
    else delete nuevas[coleccionId];
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await db.from("panel_config").insert({ key: claveNotasOF(modeloId), value: { notas: nuevas }, updated_at: ahora });
      if (!error) return nota;
    } else {
      const { data, error } = await db.from("panel_config").update({ value: { notas: nuevas }, updated_at: ahora }).eq("key", claveNotasOF(modeloId)).eq("updated_at", updated_at).select("key");
      if (!error && data?.length) return nota;
    }
  }
  throw new Error("No se pudo guardar la nota (otra persona estaba guardando a la vez). Inténtalo otra vez.");
}

/** Todas las notas de scripts/packs/posts (coleccion -> nota). */
export async function leerTodasNotasOF(): Promise<Record<string, NotaOF>> {
  const { data } = await createAdminClient().from("panel_config").select("value").like("key", "notas_of:%").limit(1000);
  const todas: Record<string, NotaOF> = {};
  for (const f of data ?? []) Object.assign(todas, (f.value as { notas?: Record<string, NotaOF> } | null)?.notas ?? {});
  return todas;
}
