// Que variante de reparto lleva cada contrato. Se guarda en panel_config (clave contrato_variante:<token>, sin columna nueva): si no hay nada, es la de siempre (70-30).
import { createAdminClient } from "@/lib/supabase/server";
import { esVarianteContrato, type VarianteContrato } from "@/lib/contratoVariantes";

const PREFIJO = "contrato_variante:";

export async function varianteDe(token: string): Promise<VarianteContrato> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", `${PREFIJO}${token}`).maybeSingle();
    const v = (data?.value as { variante?: unknown } | null)?.variante;
    return esVarianteContrato(v) ? v : "70-30";
  } catch {
    return "70-30";
  }
}

export async function guardarVariante(token: string, variante: VarianteContrato): Promise<boolean> {
  const { error } = await createAdminClient().from("panel_config").upsert({ key: `${PREFIJO}${token}`, value: { variante }, updated_at: new Date().toISOString() });
  return !error;
}

/** Variante de varios contratos de golpe (token -> variante). Los que no estan guardados son 70-30. */
export async function variantesDe(tokens: string[]): Promise<Record<string, VarianteContrato>> {
  const salida: Record<string, VarianteContrato> = {};
  if (!tokens.length) return salida;
  try {
    const db = createAdminClient();
    for (let i = 0; i < tokens.length; i += 100) {
      const { data } = await db.from("panel_config").select("key, value").in("key", tokens.slice(i, i + 100).map((t) => `${PREFIJO}${t}`));
      for (const f of data ?? []) {
        const v = (f.value as { variante?: unknown } | null)?.variante;
        if (esVarianteContrato(v)) salida[String(f.key).slice(PREFIJO.length)] = v;
      }
    }
  } catch {
    /* sin variantes: todos 70-30 */
  }
  return salida;
}
