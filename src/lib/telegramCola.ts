import { createAdminClient } from "@/lib/supabase/server";

// Cola de avisos para el grupo de Telegram. El panel solo anota el suceso; el editor (runner) los agrupa y los envia (runner/src/telegram.mjs).
// Si la tabla aun no existe (falta el SQL 20261020_captacion.sql) no pasa nada.

export type TipoAviso = "umbral" | "of_entrega" | "accesos" | "prueba" | "modelo_feedback" | "modelo_revision" | "modelo_aviso" | "modelo_asignacion";

export async function encolarTelegram(tipo: TipoAviso, modeloId: string | null, datos: Record<string, unknown> = {}): Promise<void> {
  try {
    await createAdminClient().from("telegram_cola").insert({ tipo, modelo_id: modeloId, datos });
  } catch {
    /* un aviso nunca debe romper la accion */
  }
}

/** Videos nuevos asignados a modelos (modelo_id -> cuantos): cada modelo recibe un aviso agrupado ("tienes N videos nuevos por grabar"). */
export async function encolarAsignaciones(porModelo: Map<string, number>): Promise<void> {
  for (const [modeloId, n] of porModelo) if (n > 0) await encolarTelegram("modelo_asignacion", modeloId, { n });
}
