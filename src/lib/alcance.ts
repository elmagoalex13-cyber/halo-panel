// Que modelos puede ver quien esta usando el panel.
//  - El dueño ve todas (modelos === null).
//  - Cualquier otro usuario ve SOLO las modelos marcadas como "compartidas" y lo que cuelga de ellas.
//  - Si no hay sesion, o la columna `ambito` aun no existe (falta el SQL 20261013), no ve ninguna: se falla cerrado.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const NINGUNO = "00000000-0000-0000-0000-000000000000";

export type Alcance = { dueno: boolean; modelos: string[] | null };

export async function alcanceActual(): Promise<Alcance> {
  const sesion = await sesionPanelActual();
  if (!sesion) return { dueno: false, modelos: [] };
  if (sesion.dueno) return { dueno: true, modelos: null };
  const { data, error } = await createAdminClient().from("modelos").select("id").eq("ambito", "compartido");
  return { dueno: false, modelos: error ? [] : (data ?? []).map((m) => m.id as string) };
}

/** ¿Puede ver esta modelo? */
export const veModelo = (a: Alcance, modeloId: string | null | undefined) => a.modelos === null || (Boolean(modeloId) && a.modelos.includes(modeloId as string));

/** Limita una consulta de Supabase a las modelos visibles (no hace nada para el dueño). Llamar DESPUES del select/update/delete. */
export function soloVisibles<Q>(consulta: Q, a: Alcance, columna = "modelo_id"): Q {
  if (a.modelos === null) return consulta;
  return (consulta as unknown as { in: (c: string, v: string[]) => Q }).in(columna, a.modelos.length ? a.modelos : [NINGUNO]);
}

export const modeloProhibido = () => NextResponse.json({ error: "No tienes acceso a esta modelo" }, { status: 403 });

export type TablaDeModelo =
  | "library_content"
  | "of_colecciones"
  | "of_archivos"
  | "cuentas_instagram"
  | "encargos"
  | "facturacion_modelos"
  | "virales_propios"
  | "venuz_cuentas";

/** modelo_id de una fila (null si no existe o no tiene modelo). */
export async function modeloDeFila(tabla: TablaDeModelo, id: string): Promise<string | null> {
  const { data } = await createAdminClient().from(tabla).select("modelo_id").eq("id", id).maybeSingle();
  return (data?.modelo_id as string | null | undefined) ?? null;
}

/**
 * Para rutas que reciben el id de una fila: devuelve null si puede continuar, o la respuesta 403 si no.
 * El dueño pasa siempre; los demas solo si la fila pertenece a una modelo compartida.
 */
export async function exigirFila(tabla: TablaDeModelo, id: string, a?: Alcance): Promise<NextResponse | null> {
  const alcance = a ?? (await alcanceActual());
  if (alcance.modelos === null) return null;
  return veModelo(alcance, await modeloDeFila(tabla, id)) ? null : modeloProhibido();
}

/** Igual, cuando ya se conoce el id de la modelo. */
export async function exigirModelo(modeloId: string | null | undefined, a?: Alcance): Promise<NextResponse | null> {
  const alcance = a ?? (await alcanceActual());
  return veModelo(alcance, modeloId) ? null : modeloProhibido();
}

/** Limita una consulta a una lista de ids (null = sin limite, para el dueño). */
export function soloEn<Q>(consulta: Q, ids: string[] | null, columna: string): Q {
  if (ids === null) return consulta;
  return (consulta as unknown as { in: (c: string, v: string[]) => Q }).in(columna, ids.length ? ids : [NINGUNO]);
}

/** Cuentas de Venuz que puede ver: las vinculadas a modelos visibles (las sin vincular solo las ve el dueño). null = todas. */
export async function cuentasVenuzVisibles(a: Alcance): Promise<string[] | null> {
  if (a.modelos === null) return null;
  const { data } = await soloVisibles(createAdminClient().from("venuz_cuentas").select("id"), a);
  return (data ?? []).map((c) => c.id as string);
}
