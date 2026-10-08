/**
 * Salud del sistema para el panel: cada minuto el runner deja una marca en panel_config ("runner_latido:<maquina>") con la hora
 * y el tamano de la cola. El dashboard avisa si el editor deja de responder o si hay vídeos esperando demasiado.
 * Si la tabla panel_config aun no existe (falta el SQL 20261019_escala.sql), no pasa nada.
 */
import os from "os";
import { config } from "./config.mjs";

const MAQUINA = os.hostname();
let avisadoSinTabla = false;

export async function latido(supabase, estado = {}) {
  try {
    const [pend, proc, error] = await Promise.all([
      supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "editando").eq("estado_procesamiento", "pendiente"),
      supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "editando").eq("estado_procesamiento", "procesando"),
      supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado_procesamiento", "error"),
    ]);
    const { data: masAntigua } = await supabase
      .from("library_content")
      .select("recibido_at")
      .eq("estado", "editando")
      .eq("estado_procesamiento", "pendiente")
      .order("recibido_at", { ascending: true })
      .limit(1);
    const { error: errUpsert } = await supabase.from("panel_config").upsert({
      key: `runner_latido:${MAQUINA}`,
      value: {
        at: new Date().toISOString(),
        maquina: MAQUINA,
        pendientes: pend.count ?? 0,
        procesando: proc.count ?? 0,
        errores: error.count ?? 0,
        espera_mas_antigua: masAntigua?.[0]?.recibido_at ?? null,
        trabajadores: config.runnerConcurrency,
        ...estado,
      },
      updated_at: new Date().toISOString(),
    });
    if (errUpsert && !avisadoSinTabla) {
      avisadoSinTabla = true;
      console.log(`[salud] no se puede guardar el latido (${errUpsert.message}); falta el SQL 20261019_escala.sql`);
    }
  } catch (e) {
    console.error("[salud] error:", e.message);
  }
}
