// Para quien es cada contrato: «compartido» (los dos socios) o «privado» (solo el dueño: una modelo que lleva el solo, sin que su socio lo vea).
// Se guarda en panel_config (clave contrato_ambito:<token>, sin columna nueva): si no hay nada guardado, es compartido (como todos los de antes).
// Solo el dueño puede crear contratos privados; el socio solo crea y ve los compartidos.
import { createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export type AmbitoContrato = "compartido" | "privado";
const PREFIJO = "contrato_ambito:";

export async function ambitoDe(token: string): Promise<AmbitoContrato> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", `${PREFIJO}${token}`).maybeSingle();
    return (data?.value as { ambito?: unknown } | null)?.ambito === "privado" ? "privado" : "compartido";
  } catch {
    return "compartido";
  }
}

export async function guardarAmbito(token: string, ambito: AmbitoContrato): Promise<boolean> {
  if (ambito !== "privado") return true; // compartido = lo normal, no se guarda nada
  const { error } = await createAdminClient().from("panel_config").upsert({ key: `${PREFIJO}${token}`, value: { ambito }, updated_at: new Date().toISOString() });
  return !error;
}

/** Los tokens que son privados, de entre los dados. */
export async function tokensPrivados(tokens: string[]): Promise<Set<string>> {
  const privados = new Set<string>();
  if (!tokens.length) return privados;
  try {
    const db = createAdminClient();
    for (let i = 0; i < tokens.length; i += 100) {
      const { data } = await db.from("panel_config").select("key, value").in("key", tokens.slice(i, i + 100).map((t) => `${PREFIJO}${t}`));
      for (const f of data ?? []) if ((f.value as { ambito?: unknown } | null)?.ambito === "privado") privados.add(String(f.key).slice(PREFIJO.length));
    }
  } catch {
    /* sin datos: todos compartidos */
  }
  return privados;
}

/** ¿Puede esta persona ver ese contrato? El dueño todos; el socio solo los compartidos. */
export async function puedeVerContrato(token: string): Promise<boolean> {
  const sesion = await sesionPanelActual();
  if (!sesion) return false;
  if (sesion.dueno) return true;
  return (await ambitoDe(token)) === "compartido";
}

/** Por id del contrato (para las rutas que lo reciben asi). Si no existe, devuelve true para que la ruta responda su propio «no encontrado». */
export async function puedeVerContratoId(id: string): Promise<boolean> {
  const { data } = await createAdminClient().from("contratos_modelos").select("token").eq("id", id).maybeSingle();
  if (!data?.token) return true;
  return puedeVerContrato(data.token as string);
}
