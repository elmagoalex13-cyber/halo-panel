import { createAdminClient } from "@/lib/supabase/server";

// Por defecto, TODO lo que suben las modelos (en captacion o no) se queda en espera en «Editar videos» hasta que tu eliges que editar.
// Solo las modelos que marques como AUTOMATICAS ven sus videos nuevos editarse solos. Se guarda en panel_config
// (clave edicion_auto: { <modelo_id>: true }) con «comparar y cambiar»: no hace falta ninguna tabla nueva.
const CLAVE = "edicion_auto";

async function leer(): Promise<{ mapa: Record<string, boolean>; updated_at: string | null }> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", CLAVE).maybeSingle();
  const v = data?.value;
  return { mapa: v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, boolean>) : {}, updated_at: (data?.updated_at as string | undefined) ?? null };
}

/** { modelo_id: true } de las modelos cuya edicion es AUTOMATICA (el resto espera en «Editar videos»). */
export const leerEdicionAuto = async () => (await leer()).mapa;

/** Pone (o quita) la edicion automatica de varias modelos de una vez. */
export async function cambiarEdicionAuto(ids: string[], automatica: boolean): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 6; i++) {
    const { mapa, updated_at } = await leer();
    const nuevo = { ...mapa };
    for (const id of ids) {
      if (automatica) nuevo[id] = true;
      else delete nuevo[id];
    }
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await db.from("panel_config").insert({ key: CLAVE, value: nuevo, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data, error } = await db.from("panel_config").update({ value: nuevo, updated_at: ahora }).eq("key", CLAVE).eq("updated_at", updated_at).select("key");
      if (!error && data?.length) return true;
    }
  }
  return false;
}
