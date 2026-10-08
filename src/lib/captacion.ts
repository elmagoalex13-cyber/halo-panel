import { createAdminClient } from "@/lib/supabase/server";
import { soloVisibles, type Alcance } from "@/lib/alcance";

// Fase de CAPTACION: una modelo con objetivo_videos (p. ej. 30) sube sus videos, que se quedan EN ESPERA (estado "recibido", sin editar)
// hasta que la agencia aprueba el lote. Al llegar al objetivo se avisa de que hay que crearle la cuenta de Instagram.

export const OBJETIVO_POR_DEFECTO = 30;

export type ResumenCaptacion = {
  modelo_id: string;
  nombre: string;
  objetivo: number;
  subidos: number; // videos que ha subido ella
  enEspera: number; // subidos y aun sin aprobar el lote
  aprobada: boolean; // la agencia ya aprobo el lote (desde entonces se edita todo al subir)
  tieneCuenta: boolean; // ya tiene cuenta de Instagram activa
};

/** Modelos visibles en fase de captacion (con objetivo y lote sin aprobar), con sus contadores. Tolerante: sin el SQL devuelve []. */
export async function resumenCaptacion(alcance: Alcance): Promise<ResumenCaptacion[]> {
  try {
    const db = createAdminClient();
    const { data: modelos, error } = await soloVisibles(
      db.from("modelos").select("id, nombre, objetivo_videos, captacion_aprobada_at").not("objetivo_videos", "is", null).eq("activa", true),
      alcance,
      "id",
    );
    if (error || !modelos?.length) return [];

    return await Promise.all(
      modelos.map(async (m) => {
        const [subidos, espera, cuentas] = await Promise.all([
          db.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("origen", "upload_manual").or("tipo.is.null,tipo.neq.5"),
          db.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("estado", "recibido"),
          db.from("cuentas_instagram").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("activa", true),
        ]);
        return {
          modelo_id: m.id as string,
          nombre: m.nombre as string,
          objetivo: Number(m.objetivo_videos),
          subidos: subidos.count ?? 0,
          enEspera: espera.count ?? 0,
          aprobada: Boolean(m.captacion_aprobada_at),
          tieneCuenta: (cuentas.count ?? 0) > 0,
        };
      }),
    );
  } catch {
    return [];
  }
}

/** Avisos del dashboard derivados de la captacion. */
export function avisosCaptacion(lista: ResumenCaptacion[]): Array<{ nivel: "rojo" | "amarillo"; texto: string; href: string }> {
  const avisos: Array<{ nivel: "rojo" | "amarillo"; texto: string; href: string }> = [];
  const crearCuenta = lista.filter((c) => c.subidos >= c.objetivo && !c.tieneCuenta);
  if (crearCuenta.length) {
    avisos.push({ nivel: "rojo", texto: `Crear la cuenta de Instagram de: ${crearCuenta.map((c) => `${c.nombre} (${c.subidos}/${c.objetivo})`).join(", ")}`, href: "/modelos" });
  }
  const loteListo = lista.filter((c) => !c.aprobada && c.enEspera >= c.objetivo);
  if (loteListo.length) {
    avisos.push({ nivel: "amarillo", texto: `Lote listo para aprobar y editar: ${loteListo.map((c) => `${c.nombre} (${c.enEspera} vídeos)`).join(", ")}`, href: "/modelos" });
  }
  return avisos;
}
