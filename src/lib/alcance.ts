// Que modelos puede ver quien esta usando el panel.
//  - El dueño ve todas (modelos === null).
//  - Cualquier otro usuario ve SOLO las modelos marcadas como "compartidas" y lo que cuelga de ellas.
//  - Si no hay sesion, o la columna `ambito` aun no existe (falta el SQL 20261013), no ve ninguna: se falla cerrado.
import { cache } from "react";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const NINGUNO = "00000000-0000-0000-0000-000000000000";

// excluir: modelos en la papelera (solo se rellena para el dueño, que por lo demas lo ve todo)
export type Alcance = { dueno: boolean; modelos: string[] | null; excluir?: string[] };

export type GrupoAmbito = "mias" | "compartidas";

/** `grupo` solo lo respeta el dueño (para ver "mis modelos" o "con mi socio" por separado); el resto siempre ve solo lo compartido. */
// `cache` de React: dentro de una misma peticion (una pagina llama a esto varias veces) se resuelve una sola vez
export const alcanceActual = cache(async (grupo?: GrupoAmbito): Promise<Alcance> => {
  const sesion = await sesionPanelActual();
  if (!sesion) return { dueno: false, modelos: [] };

  // Todas las modelos con su ambito y si estan en la papelera (si falta el SQL de la papelera, se pide sin esa columna)
  type Fila = { id: string; ambito?: string | null; eliminada_at?: string | null };
  const db = createAdminClient();
  let r = await db.from("modelos").select("id, ambito, eliminada_at");
  if (r.error) r = (await db.from("modelos").select("id, ambito")) as typeof r;
  if (r.error) return sesion.dueno && !grupo ? { dueno: true, modelos: null } : { dueno: sesion.dueno, modelos: [] };
  const filas = (r.data ?? []) as Fila[];
  const eliminadas = filas.filter((m) => m.eliminada_at).map((m) => m.id);

  if (sesion.dueno) {
    if (!grupo) return { dueno: true, modelos: null, ...(eliminadas.length ? { excluir: eliminadas } : {}) };
    const ids = filas.filter((m) => !m.eliminada_at && (grupo === "compartidas" ? m.ambito === "compartido" : m.ambito !== "compartido")).map((m) => m.id);
    return { dueno: true, modelos: ids };
  }
  return { dueno: false, modelos: filas.filter((m) => !m.eliminada_at && m.ambito === "compartido").map((m) => m.id) };
});

/** ¿Puede ver esta modelo? */
export const veModelo = (a: Alcance, modeloId: string | null | undefined) => a.modelos === null || (Boolean(modeloId) && a.modelos.includes(modeloId as string));

/** Limita una consulta de Supabase a las modelos visibles (no hace nada para el dueño). Llamar DESPUES del select/update/delete. */
export function soloVisibles<Q>(consulta: Q, a: Alcance, columna = "modelo_id"): Q {
  if (a.modelos === null) {
    // El dueño lo ve todo salvo lo de las modelos en la papelera (lo que no tiene modelo se sigue viendo)
    if (!a.excluir?.length) return consulta;
    return (consulta as unknown as { or: (f: string) => Q }).or(`${columna}.is.null,${columna}.not.in.(${a.excluir.join(",")})`);
  }
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
  if (a.modelos === null && !a.excluir?.length) return null;
  const { data } = await soloVisibles(createAdminClient().from("venuz_cuentas").select("id"), a);
  return (data ?? []).map((c) => c.id as string);
}

/** Ambito de cada modelo visible (para los selectores "Mis modelos / Con mi socio" del dueño). */
export async function ambitosModelos(): Promise<{ esDueno: boolean; porModelo: Record<string, "privado" | "compartido"> }> {
  const a = await alcanceActual();
  const { data } = await soloVisibles(createAdminClient().from("modelos").select("id, ambito"), a, "id");
  const porModelo: Record<string, "privado" | "compartido"> = {};
  for (const m of data ?? []) porModelo[m.id as string] = m.ambito === "compartido" ? "compartido" : "privado";
  return { esDueno: a.dueno, porModelo };
}
