import { sampleCuentasIGDemo, sampleCuentasInstagram } from "@/lib/data";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { CuentaIGDemo, CuentaInstagram } from "@/types";

export async function loadCuentasInstagramReales(): Promise<CuentaInstagram[]> {
  if (!canUseSupabase()) return sampleCuentasInstagram;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("cuentas_instagram").select("*");
    return ((data ?? []) as CuentaInstagram[]).length ? (data as CuentaInstagram[]) : sampleCuentasInstagram;
  } catch {
    return sampleCuentasInstagram;
  }
}

export function loadCuentasIG(cuentasReales: CuentaInstagram[]): CuentaIGDemo[] {
  // Las estadisticas (seguidores, reels, demografia) son demo hasta conectar Metricool.
  // El estado de conexion si refleja lo configurado en /modelos.
  const estadoPorUsername = new Map(cuentasReales.map((cuenta) => [cuenta.username, cuenta.metricool_estado ?? "no_conectada"]));
  return sampleCuentasIGDemo.map((cuenta) => ({
    ...cuenta,
    metricool_estado: estadoPorUsername.get(cuenta.username) ?? cuenta.metricool_estado ?? "no_conectada",
  }));
}
