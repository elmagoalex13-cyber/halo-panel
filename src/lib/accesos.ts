import { createAdminClient } from "@/lib/supabase/server";

// Limite de intentos de acceso al panel: tras 8 fallos en 15 minutos (por usuario o por IP) se bloquea ese usuario/IP un rato.
// Los fallos se anotan en panel_actividad (se ven en Actividad). Si la tabla no existe, no se bloquea nada (el acceso sigue funcionando).

const MAX_FALLOS = 8;
const VENTANA_MS = 15 * 60 * 1000;
const limpio = (u: string) => u.trim().toLowerCase().slice(0, 60);

export const acceso = {
  async bloqueado(usuario: string, ip: string): Promise<boolean> {
    try {
      const desde = new Date(Date.now() - VENTANA_MS).toISOString();
      const db = createAdminClient();
      const [porUsuario, porIp] = await Promise.all([
        db.from("panel_actividad").select("id", { count: "exact", head: true }).eq("metodo", "LOGIN").eq("usuario", limpio(usuario)).gte("created_at", desde),
        db.from("panel_actividad").select("id", { count: "exact", head: true }).eq("metodo", "LOGIN").eq("ruta", ip).gte("created_at", desde),
      ]);
      return (porUsuario.count ?? 0) >= MAX_FALLOS || (porIp.count ?? 0) >= MAX_FALLOS * 2;
    } catch {
      return false;
    }
  },
  async fallo(usuario: string, ip: string): Promise<void> {
    try {
      await createAdminClient().from("panel_actividad").insert({ usuario: limpio(usuario) || "(vacío)", accion: "Intento de acceso fallido", sensible: false, ids: [], metodo: "LOGIN", ruta: ip });
    } catch {
      /* nunca debe romper el login */
    }
  },
};
