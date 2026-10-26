// «Posts programados»: cuando TODOS los posts aprobados de una modelo ya estan programados en Venuz (no queda ninguno esperando ni con error),
// el editor deja un aviso en panel_config (clave posts_avisos) y el dashboard lo ensena hasta que cada persona lo marca como visto
// (posts_avisos_vistos:<usuario>).
import { createAdminClient } from "@/lib/supabase/server";
import { veModelo, type Alcance } from "@/lib/alcance";

export type AvisoPostsProgramados = { id: string; modelo_id: string; nombre: string; n: number; hasta: string | null; at: string };

const claveVistos = (usuario: string) => `posts_avisos_vistos:${usuario}`;

export async function avisosPostsProgramados(alcance: Alcance, usuario: string | null): Promise<AvisoPostsProgramados[]> {
  try {
    const db = createAdminClient();
    const [{ data: cfg }, { data: vistos }] = await Promise.all([
      db.from("panel_config").select("value").eq("key", "posts_avisos").maybeSingle(),
      usuario ? db.from("panel_config").select("value").eq("key", claveVistos(usuario)).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const lista = ((cfg?.value as { lista?: AvisoPostsProgramados[] } | null)?.lista ?? []) as AvisoPostsProgramados[];
    const vistas = new Set(((vistos?.value as string[] | null) ?? []) as string[]);
    const desde = Date.now() - 14 * 86400000; // los avisos viejos dejan de salir solos
    return lista.filter((a) => !vistas.has(a.id) && veModelo(alcance, a.modelo_id) && new Date(a.at).getTime() > desde).sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

export async function marcarPostsAvisosVistos(usuario: string, ids: string[]): Promise<void> {
  const db = createAdminClient();
  const clave = claveVistos(usuario);
  const { data } = await db.from("panel_config").select("value").eq("key", clave).maybeSingle();
  const actual = ((data?.value as string[] | null) ?? []) as string[];
  const nuevo = [...new Set([...actual, ...ids])].slice(-200);
  await db.from("panel_config").upsert({ key: clave, value: nuevo, updated_at: new Date().toISOString() });
}
