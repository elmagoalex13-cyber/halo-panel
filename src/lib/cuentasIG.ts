import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { CuentaIGDemo, CuentaInstagram } from "@/types";

type CuentaRow = CuentaInstagram & { seguidores?: number | null; modelos?: { nombre?: string | null } | null };

export async function loadCuentasInstagramReales(): Promise<Array<CuentaInstagram & { seguidores?: number | null }>> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("cuentas_instagram").select("*, modelos(nombre)").order("username");
    if (error) return [];
    return ((data ?? []) as CuentaRow[]).map((row) => ({ ...row, modelo_nombre: row.modelos?.nombre ?? row.modelo_nombre ?? "" }));
  } catch {
    return [];
  }
}

// Las estadisticas detalladas (posts, reels, demografia) llegan cuando se conecte Metricool.
// Hasta entonces solo se muestran los datos reales guardados en cuentas_instagram.
export function loadCuentasIG(cuentas: Array<CuentaInstagram & { seguidores?: number | null }>): CuentaIGDemo[] {
  return cuentas.map((cuenta) => ({
    id: cuenta.id,
    username: cuenta.username,
    modelo_nombre: cuenta.modelo_nombre ?? "",
    avatar_url: null,
    tag: null,
    publicaciones: 0,
    seguidores: Number(cuenta.seguidores ?? 0),
    seguidos: 0,
    bio: [],
    ganancia_hoy: 0,
    ganancia_7d: 0,
    ganancia_30d: 0,
    ganancia_90d: 0,
    estado: cuenta.activa ? "activa" : "pausada",
    ultimo_reel: "",
    reels: [],
    reels_30d_count: 0,
    reels_7d_count: 0,
    mediana_visitas: 0,
    demografia: { pct_mujeres: 0, pct_hombres: 0, tramos: [], ciudades: [], fecha: "" },
    metricool_estado: cuenta.metricool_estado ?? "no_conectada",
  }));
}
