import type { SupabaseClient } from "@supabase/supabase-js";
import { soloVisibles, type Alcance } from "@/lib/alcance";

// Agregados por modelo para el dashboard. Los calcula la funcion dashboard_piezas() de la base de datos (SQL 20261019): una sola
// consulta, valida para cualquier volumen. Si aun no existe, se calculan igual en el servidor a partir de las ultimas 1.000 piezas
// (el tope de Supabase por consulta), que es lo que hacia el dashboard antes.

export const CLAVES_AGG = [
  "total", "editando", "en_aprobacion", "aprobado", "publicado", "rechazado", "aprobado_futuro", "aprobado_pasado",
  "r_pend", "r_proc", "r_err", "este_mes", "mes_pasado", "aprob_semana", "ap_semana", "ap_mes", "ap_todo",
  "co_semana", "co_mes", "co_todo", "urg_aprob", "urg_edit", "p30_total", "p30_aprobados", "p30_publicados",
  "trial_aprob_futuro", "trial_aprob_sin", "trial_publicados",
] as const;

export type ClaveAgg = (typeof CLAVES_AGG)[number];
export type FilaAgg = { modelo_id: string | null; ult_recibido: string | null } & Record<ClaveAgg, number>;

type PiezaMin = {
  modelo_id: string | null;
  estado: string;
  tipo: number | null;
  recibido_at: string;
  aprobado_at: string | null;
  publicado_at: string | null;
  estado_procesamiento: string | null;
};

const vacia = (modelo_id: string | null): FilaAgg => ({ modelo_id, ult_recibido: null, ...(Object.fromEntries(CLAVES_AGG.map((k) => [k, 0])) as Record<ClaveAgg, number>) });

/** Misma logica que dashboard_piezas() en SQL, para cuando la funcion aun no existe. */
export function agregarFilas(piezas: PiezaMin[], ahora: Date, mesInicio: Date, mesPasadoInicio: Date): FilaAgg[] {
  const t = (s: string | null) => (s ? new Date(s).getTime() : NaN);
  const now = ahora.getTime();
  const sem = now - 7 * 86400000;
  const d30 = now - 30 * 86400000;
  const h24 = now - 24 * 3600000;
  const mes = mesInicio.getTime();
  const mesPas = mesPasadoInicio.getTime();
  const por = new Map<string | null, FilaAgg>();

  for (const p of piezas) {
    const f = por.get(p.modelo_id) ?? vacia(p.modelo_id);
    por.set(p.modelo_id, f);
    const futuro = t(p.publicado_at) > now;
    if (p.tipo === 5) {
      if (p.estado === "aprobado") f[futuro ? "trial_aprob_futuro" : "trial_aprob_sin"]++;
      if (p.estado === "publicado") f.trial_publicados++;
      continue;
    }
    const rec = t(p.recibido_at);
    const fechaAp = t(p.aprobado_at ?? p.recibido_at);
    f.total++;
    if (p.estado in f) (f as unknown as Record<string, number>)[p.estado]++; // editando, en_aprobacion, aprobado, publicado, rechazado
    if (p.estado === "aprobado") {
      if (futuro) f.aprobado_futuro++;
      else if (t(p.publicado_at) <= now) f.aprobado_pasado++;
      f.ap_todo++;
      if (fechaAp >= sem) f.ap_semana++;
      if (fechaAp >= mes) f.ap_mes++;
    }
    if (p.estado === "publicado") {
      f.co_todo++;
      if (fechaAp >= sem) f.co_semana++;
      if (fechaAp >= mes) f.co_mes++;
    }
    if (p.estado === "editando" && p.estado_procesamiento === "pendiente") f.r_pend++;
    if (p.estado === "editando" && p.estado_procesamiento === "procesando") f.r_proc++;
    if (p.estado_procesamiento === "error") f.r_err++;
    if (!f.ult_recibido || rec > t(f.ult_recibido)) f.ult_recibido = p.recibido_at;
    if (rec >= mes) f.este_mes++;
    if (rec >= mesPas && rec < mes) f.mes_pasado++;
    if ((p.estado === "aprobado" || p.estado === "publicado") && t(p.aprobado_at) >= sem) f.aprob_semana++;
    if (p.estado === "en_aprobacion" && rec < h24) f.urg_aprob++;
    if (p.estado === "editando" && rec < h24) f.urg_edit++;
    if (rec >= d30) {
      f.p30_total++;
      if (p.estado === "aprobado" || p.estado === "publicado") f.p30_aprobados++;
      if (p.estado === "publicado") f.p30_publicados++;
    }
  }
  return [...por.values()];
}

export async function cargarAgregados(supabase: SupabaseClient, alcance: Alcance, ahora = new Date()): Promise<FilaAgg[]> {
  const mesInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const mesPasadoInicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);

  const { data, error } = await supabase.rpc("dashboard_piezas", {
    p_incluir: alcance.modelos,
    p_excluir: alcance.excluir ?? [],
    p_ahora: ahora.toISOString(),
    p_mes_inicio: mesInicio.toISOString(),
    p_mes_pasado_inicio: mesPasadoInicio.toISOString(),
  });
  if (!error && Array.isArray(data)) {
    return (data as Array<Record<string, unknown>>).map((r) => ({
      ...vacia((r.modelo_id as string | null) ?? null),
      ult_recibido: (r.ult_recibido as string | null) ?? null,
      ...(Object.fromEntries(CLAVES_AGG.map((k) => [k, Number(r[k] ?? 0)])) as Record<ClaveAgg, number>),
    }));
  }

  const { data: filas } = await soloVisibles(
    supabase
      .from("library_content")
      .select("modelo_id, estado, tipo, recibido_at, aprobado_at, publicado_at, estado_procesamiento")
      .order("recibido_at", { ascending: false })
      .limit(1000),
    alcance,
  );
  return agregarFilas((filas ?? []) as PiezaMin[], ahora, mesInicio, mesPasadoInicio);
}
