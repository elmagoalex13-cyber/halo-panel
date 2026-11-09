import { createAdminClient } from "@/lib/supabase/server";

// «Editar videos»: el numero del menu cuenta solo los videos que han llegado DESPUES de la ultima vez que esa persona pulso «Marcar como vistos».
// Cada usuario del panel tiene el suyo (panel_config, clave editar_vistos:<usuario>); no hace falta ninguna tabla nueva.
const clave = (usuario: string) => `editar_vistos:${usuario}`;

/** Fecha (ISO) hasta la que esa persona ya ha visto lo que espera. null = todavia no ha marcado nada (cuenta todo). */
export async function leerVistoEditar(usuario: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", clave(usuario)).maybeSingle();
    const v = (data?.value as { hasta?: string } | null)?.hasta;
    return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export async function marcarVistoEditar(usuario: string, hasta = new Date().toISOString()): Promise<void> {
  await createAdminClient().from("panel_config").upsert({ key: clave(usuario), value: { hasta }, updated_at: new Date().toISOString() });
}
