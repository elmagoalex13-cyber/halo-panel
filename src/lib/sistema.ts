import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";

// Ajustes y estado del sistema (tabla panel_config, SQL 20261019). Todo es tolerante: si la tabla no existe se usan los valores por defecto.

export const RETENCION_POR_DEFECTO = 60; // dias que se conserva el original tras publicar (0 = nunca borrar)

export type Latido = {
  at: string;
  maquina: string;
  pendientes: number;
  procesando: number;
  errores: number;
  espera_mas_antigua: string | null;
  trabajadores: number;
};

export type EstadoSistema = {
  tablaLista: boolean;
  retencionDias: number;
  retencionActiva: boolean; // el dueño ya la ha guardado alguna vez (hasta entonces NO se borra nada solo)
  runners: Latido[];
  limpieza: { at: string; borrados: number } | null;
  backup: { at: string; dia: string; tablas: number } | null;
  telegram: { configurado: boolean; privado?: boolean; at: string; ultimo_envio?: string; error?: string } | null;
};

export const leerSistema = cache(async (): Promise<EstadoSistema> => {
  const vacio: EstadoSistema = { tablaLista: false, retencionDias: RETENCION_POR_DEFECTO, retencionActiva: false, runners: [], limpieza: null, backup: null, telegram: null };
  try {
    const { data, error } = await createAdminClient().from("panel_config").select("key, value, updated_at");
    if (error) return vacio;
    const e: EstadoSistema = { ...vacio, tablaLista: true };
    for (const f of data ?? []) {
      const v = f.value as Record<string, unknown>;
      if (f.key === "retencion_originales_dias") {
        const n = Number((v as { dias?: unknown }).dias ?? v);
        if (Number.isFinite(n) && n >= 0) {
          e.retencionDias = Math.min(730, Math.round(n));
          e.retencionActiva = true;
        }
      } else if (String(f.key).startsWith("runner_latido:")) e.runners.push(v as unknown as Latido);
      else if (f.key === "limpieza_originales") e.limpieza = v as unknown as EstadoSistema["limpieza"];
      else if (f.key === "backup_db") e.backup = v as unknown as EstadoSistema["backup"];
      else if (f.key === "telegram_estado") e.telegram = v as unknown as EstadoSistema["telegram"];
    }
    return e;
  } catch {
    return vacio;
  }
});

export async function guardarRetencion(dias: number) {
  const { error } = await createAdminClient()
    .from("panel_config")
    .upsert({ key: "retencion_originales_dias", value: { dias }, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function guardarEstado(clave: string, valor: Record<string, unknown>) {
  await createAdminClient().from("panel_config").upsert({ key: clave, value: valor, updated_at: new Date().toISOString() });
}

const minutosDesde = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null);

/** El editor responde si dejo su latido hace menos de 4 minutos. */
export const runnerEnLinea = (l: Latido) => (minutosDesde(l.at) ?? Infinity) < 4;

export function avisosSistema(s: EstadoSistema): Array<{ nivel: "rojo" | "amarillo"; texto: string; href?: string }> {
  if (!s.tablaLista || !s.runners.length) return [];
  const avisos: Array<{ nivel: "rojo" | "amarillo"; texto: string; href?: string }> = [];
  const enLinea = s.runners.filter(runnerEnLinea);
  if (!enLinea.length) {
    avisos.push({ nivel: "rojo", texto: "El editor de vídeo no responde: los vídeos subidos no se están editando. Avisa para revisar el servidor.", href: "/ajustes" });
    return avisos;
  }
  const pendientes = Math.max(...enLinea.map((r) => r.pendientes));
  const horas = Math.max(0, ...enLinea.map((r) => (minutosDesde(r.espera_mas_antigua) ?? 0) / 60));
  if (pendientes > 0 && horas >= 3) {
    avisos.push({ nivel: "amarillo", texto: `${pendientes} vídeo${pendientes > 1 ? "s" : ""} en cola de edición, el más antiguo lleva ${Math.round(horas)} h esperando. Si pasa a menudo, hay que añadir otro servidor de edición.`, href: "/ajustes" });
  }
  return avisos;
}
