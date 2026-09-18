import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// El runner marca estado_procesamiento='listo' al terminar. El panel usa `estado` para el pipeline,
// asi que las piezas que siguen en "editando" con procesamiento "listo" pasan a "en_aprobacion".
export async function syncRunnerResultados(): Promise<number> {
  if (!canUseSupabase()) return 0;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("library_content")
      .update({
        estado: "en_aprobacion",
        edicion_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("estado", "editando")
      .eq("estado_procesamiento", "listo")
      .select("id");
    if (error) return 0;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
