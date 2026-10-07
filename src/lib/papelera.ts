import { createAdminClient } from "@/lib/supabase/server";

// Papelera de modelos: una modelo "borrada" sigue en la base de datos (columna eliminada_at) pero desaparece del panel,
// de su portal y de la programacion. Solo el dueño la ve y puede restaurarla. Si la columna aun no existe (falta el SQL
// 20261016_papelera.sql), nada esta eliminado.

/** ¿Esta modelo esta en la papelera? */
export async function modeloEliminada(id: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from("modelos").select("eliminada_at").eq("id", id).maybeSingle();
    return !error && Boolean(data?.eliminada_at);
  } catch {
    return false;
  }
}

/** Ids de las modelos que estan en la papelera. */
export async function idsModelosEliminadas(): Promise<string[]> {
  try {
    const { data, error } = await createAdminClient().from("modelos").select("id").not("eliminada_at", "is", null);
    return error ? [] : (data ?? []).map((m) => m.id as string);
  } catch {
    return [];
  }
}
