// Checks INTERNOS de cada credencial del Vault (los hacemos nosotros, la modelo no los ve): «hemos podido acceder» y «las credenciales son
// validas», con quien lo marco y cuando. Se guardan en panel_config (clave vault_checks:<id de la entrada>, sin tabla nueva). Cuando la modelo
// vuelve a enviar sus accesos se borran (hay datos nuevos que comprobar).
import { createAdminClient } from "@/lib/supabase/server";

export type CheckVault = { por: string; at: string };
// «valida» e «invalida» se excluyen: una credencial o es valida o no lo es (si no lo es, la modelo recibe un aviso para volver a enviarla)
export type ChecksEntrada = { acceso?: CheckVault; valida?: CheckVault; invalida?: CheckVault };
export type CampoCheck = "acceso" | "valida" | "invalida";

export const claveChecks = (id: string) => `vault_checks:${id}`;

export async function leerChecks(ids: string[]): Promise<Record<string, ChecksEntrada>> {
  const salida: Record<string, ChecksEntrada> = {};
  if (!ids.length) return salida;
  const db = createAdminClient();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from("panel_config").select("key, value").in("key", ids.slice(i, i + 100).map(claveChecks));
    for (const f of data ?? []) salida[String(f.key).slice("vault_checks:".length)] = (f.value as ChecksEntrada) ?? {};
  }
  return salida;
}
