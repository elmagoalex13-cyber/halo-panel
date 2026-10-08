import { createAdminClient } from "@/lib/supabase/server";

// Cola de avisos para el grupo de Telegram. El panel solo anota el suceso; el editor (runner) los agrupa y los envia (runner/src/telegram.mjs).
// Si la tabla aun no existe (falta el SQL 20261020_captacion.sql) no pasa nada.

export type TipoAviso = "umbral" | "of_entrega" | "accesos" | "prueba" | "modelo_feedback" | "modelo_revision";

export async function encolarTelegram(tipo: TipoAviso, modeloId: string | null, datos: Record<string, unknown> = {}): Promise<void> {
  try {
    await createAdminClient().from("telegram_cola").insert({ tipo, modelo_id: modeloId, datos });
  } catch {
    /* un aviso nunca debe romper la accion */
  }
}
