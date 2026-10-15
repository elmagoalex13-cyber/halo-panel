import { createAdminClient } from "@/lib/supabase/server";
import { soloVisibles, type Alcance } from "@/lib/alcance";
import { decryptVaultValue, encryptVaultValue } from "@/lib/vault/crypto";
import { leerChecks } from "@/lib/vaultChecks";

// ACCESOS de cada modelo (OnlyFans y Skrill): los rellena ella en su portal (obligatorio) y se guardan CIFRADOS en el Vault:
// en el baul compartido si la modelo es compartida, y en el del dueño si es privada. No pasan por el onboarding (que guarda
// un historial inmutable). Se identifican por (modelo_id + prefijo del nombre).

export const PREFIJO_OF = "OnlyFans · ";
export const PREFIJO_SKRILL = "Skrill · ";
const LINEA_PIN = "PIN de Skrill: ";

export type DatosAccesos = {
  of_correo: string;
  of_password: string;
  sk_correo: string;
  sk_password_correo: string;
  sk_password: string;
  sk_pin: string;
};

const limpiar = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PIN_VALIDO = /^\d{4,8}$/;

/** Valida y limpia lo que envia la modelo. `modo: "of"` = solo OnlyFans (las modelos privadas); si no, OnlyFans y Skrill (compartidas). */
export function validarAccesos(raw: unknown, modo: "completo" | "of" | "sk" = "completo"): { datos?: DatosAccesos; error?: string } {
  const s = (raw ?? {}) as Record<string, unknown>;
  const d: DatosAccesos = {
    of_correo: limpiar(s.of_correo),
    of_password: limpiar(s.of_password),
    sk_correo: limpiar(s.sk_correo),
    sk_password_correo: limpiar(s.sk_password_correo),
    sk_password: limpiar(s.sk_password),
    sk_pin: limpiar(s.sk_pin, 12).replace(/\s/g, ""),
  };
  if (modo !== "sk") {
    if (!CORREO.test(d.of_correo)) return { error: "El correo de OnlyFans no es válido" };
    if (!d.of_password) return { error: "Falta la contraseña de OnlyFans" };
  }
  if (modo === "of") return { datos: d };
  if (!CORREO.test(d.sk_correo)) return { error: "El correo de Skrill no es válido" };
  if (!d.sk_password_correo) return { error: "Falta la contraseña del correo de Skrill" };
  if (!d.sk_password) return { error: "Falta la contraseña de Skrill" };
  if (!PIN_VALIDO.test(d.sk_pin)) return { error: "El PIN de Skrill son entre 4 y 8 números" };
  return { datos: d };
}

async function guardarEntrada(modeloId: string, nombre: string, categoria: string, descripcion: string, ambito: "privado" | "compartido", valor: string) {
  const db = createAdminClient();
  const cifrado = encryptVaultValue(valor);
  const prefijo = nombre.split(" · ")[0] + " · ";
  const { data: existente } = await db.from("vault_panel").select("id").eq("modelo_id", modeloId).like("nombre", `${prefijo}%`).limit(1).maybeSingle();
  const fila = { nombre, categoria, descripcion, modelo_id: modeloId, ...cifrado };
  if (existente?.id) {
    // Se recupera de la papelera si estaba eliminada; el valor anterior queda como "version anterior" (trigger de la BD)
    let r = await db.from("vault_panel").update({ ...fila, ambito, eliminada_at: null, eliminada_por: null, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (r.error) r = await db.from("vault_panel").update({ ...fila, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (r.error) throw new Error(r.error.message);
    await db.from("panel_config").delete().eq("key", `vault_checks:${existente.id}`); // datos nuevos: hay que volver a comprobar el acceso
  } else {
    let r = await db.from("vault_panel").insert({ ...fila, ambito });
    if (r.error) r = await db.from("vault_panel").insert(fila);
    if (r.error) throw new Error(r.error.message);
  }
}

/** Guarda (o actualiza) el acceso de OnlyFans de la modelo en el Vault, cifrado. */
export async function guardarAccesoOF(modeloId: string, nombreModelo: string, ambito: "privado" | "compartido", d: Pick<DatosAccesos, "of_correo" | "of_password">) {
  await guardarEntrada(modeloId, `${PREFIJO_OF}${nombreModelo}`, "of_credentials", "Enviado por la modelo desde su portal", ambito, `Correo: ${d.of_correo}\nContraseña: ${d.of_password}`);
}

/** Guarda (o actualiza) solo el acceso de Skrill (cuando la agencia marca el que tenia como no valido y ella lo vuelve a enviar). */
export async function guardarAccesoSkrill(modeloId: string, nombreModelo: string, ambito: "privado" | "compartido", d: Pick<DatosAccesos, "sk_correo" | "sk_password_correo" | "sk_password" | "sk_pin">) {
  await guardarEntrada(
    modeloId,
    `${PREFIJO_SKRILL}${nombreModelo}`,
    "banco",
    "Enviado por la modelo desde su portal",
    ambito,
    `Correo de Skrill: ${d.sk_correo}\nContraseña del correo: ${d.sk_password_correo}\nContraseña de Skrill: ${d.sk_password}\n${LINEA_PIN}${d.sk_pin}`,
  );
}

/** Que accesos de esta modelo hemos marcado como NO validos (y aun no ha vuelto a enviar): "of" y/o "skrill". */
export async function accesosInvalidos(modeloId: string): Promise<Array<"of" | "skrill">> {
  try {
    const { data } = await createAdminClient().from("vault_panel").select("id, nombre").eq("modelo_id", modeloId).or(`nombre.like.${PREFIJO_OF}%,nombre.like.${PREFIJO_SKRILL}%`).is("eliminada_at", null);
    if (!data?.length) return [];
    const checks = await leerChecks(data.map((e) => e.id as string));
    const salida: Array<"of" | "skrill"> = [];
    for (const e of data) if (checks[e.id as string]?.invalida) salida.push(String(e.nombre).startsWith(PREFIJO_OF) ? "of" : "skrill");
    return salida;
  } catch {
    return [];
  }
}

/** Modelos (visibles) con algun acceso marcado como no valido y pendiente de que lo vuelvan a enviar. */
export async function modelosConAccesosInvalidos(alcance: Alcance): Promise<Array<{ id: string; nombre: string; cuales: Array<"of" | "skrill"> }>> {
  try {
    const db = createAdminClient();
    const { data: modelos } = await soloVisibles(db.from("modelos").select("id, nombre").eq("activa", true), alcance, "id");
    if (!modelos?.length) return [];
    const { data: entradas } = await db.from("vault_panel").select("id, modelo_id, nombre").in("modelo_id", modelos.map((m) => m.id)).or(`nombre.like.${PREFIJO_OF}%,nombre.like.${PREFIJO_SKRILL}%`).is("eliminada_at", null);
    const checks = await leerChecks((entradas ?? []).map((e) => e.id as string));
    const porModelo = new Map<string, Array<"of" | "skrill">>();
    for (const e of entradas ?? []) {
      if (!checks[e.id as string]?.invalida) continue;
      porModelo.set(e.modelo_id as string, [...(porModelo.get(e.modelo_id as string) ?? []), String(e.nombre).startsWith(PREFIJO_OF) ? "of" : "skrill"]);
    }
    return modelos.filter((m) => porModelo.has(m.id as string)).map((m) => ({ id: m.id as string, nombre: m.nombre as string, cuales: porModelo.get(m.id as string)! }));
  } catch {
    return [];
  }
}

/** Guarda (o actualiza) los accesos de OnlyFans y Skrill (modelos compartidas). */
export async function guardarAccesosModelo(modeloId: string, nombreModelo: string, ambito: "privado" | "compartido", d: DatosAccesos) {
  await guardarAccesoOF(modeloId, nombreModelo, ambito, d);
  await guardarEntrada(
    modeloId,
    `${PREFIJO_SKRILL}${nombreModelo}`,
    "banco",
    "Enviado por la modelo desde su portal",
    ambito,
    `Correo de Skrill: ${d.sk_correo}\nContraseña del correo: ${d.sk_password_correo}\nContraseña de Skrill: ${d.sk_password}\n${LINEA_PIN}${d.sk_pin}`,
  );
}

async function entradaSkrill(modeloId: string) {
  const { data } = await createAdminClient().from("vault_panel").select("id, encrypted_blob, iv").eq("modelo_id", modeloId).like("nombre", `${PREFIJO_SKRILL}%`).is("eliminada_at", null).limit(1).maybeSingle();
  return data as { id: string; encrypted_blob: string; iv: string } | null;
}

/** Añade (o cambia) el PIN de Skrill en la entrada de Skrill que la modelo ya habia enviado sin el. */
export async function anadirPinSkrill(modeloId: string, pin: string) {
  const e = await entradaSkrill(modeloId);
  if (!e) throw new Error("Primero hacen falta tus accesos de Skrill");
  const texto = decryptVaultValue(e.encrypted_blob, e.iv)
    .split("\n")
    .filter((l) => !l.startsWith(LINEA_PIN))
    .join("\n")
    .trimEnd();
  const cifrado = encryptVaultValue(`${texto}\n${LINEA_PIN}${pin}`);
  const { error } = await createAdminClient().from("vault_panel").update({ ...cifrado, updated_at: new Date().toISOString() }).eq("id", e.id);
  if (error) throw new Error(error.message);
}

const lineaTienePin = (texto: string) => texto.split("\n").some((l) => l.startsWith(LINEA_PIN) && l.slice(LINEA_PIN.length).trim().length > 0);

/** Skrill ya enviado pero sin PIN? (true = falta el PIN; false = lo tiene o aun no hay Skrill). */
export async function faltaPinSkrill(modeloId: string): Promise<boolean> {
  try {
    const e = await entradaSkrill(modeloId);
    return e ? !lineaTienePin(decryptVaultValue(e.encrypted_blob, e.iv)) : false;
  } catch {
    return false;
  }
}

/** Modelos compartidas que ya enviaron su Skrill pero NO el PIN (se les avisa en su portal y en el dashboard). */
export async function modelosSinPin(alcance: Alcance): Promise<Array<{ id: string; nombre: string }>> {
  try {
    const db = createAdminClient();
    const { data: modelos } = await soloVisibles(db.from("modelos").select("id, nombre").eq("activa", true).eq("ambito", "compartido").not("portal_token", "is", null), alcance, "id");
    if (!modelos?.length) return [];
    const { data: entradas } = await db.from("vault_panel").select("modelo_id, encrypted_blob, iv").in("modelo_id", modelos.map((m) => m.id)).like("nombre", `${PREFIJO_SKRILL}%`).is("eliminada_at", null);
    const conSkrill = new Map((entradas ?? []).map((e) => [e.modelo_id as string, e]));
    return modelos
      .filter((m) => {
        const e = conSkrill.get(m.id as string);
        if (!e) return false; // aun no ha dado el Skrill: ya sale en «faltan los accesos»
        try {
          return !lineaTienePin(decryptVaultValue(e.encrypted_blob as string, e.iv as string));
        } catch {
          return false;
        }
      })
      .map((m) => ({ id: m.id as string, nombre: m.nombre as string }));
  } catch {
    return [];
  }
}

/** ¿Ha dado ya sus accesos? `solo: "of"` = basta con OnlyFans. Si la tabla/columna no esta lista, se da por completo para no bloquear a nadie. */
export async function accesosCompletos(modeloId: string, solo: "completo" | "of" = "completo"): Promise<boolean> {
  try {
    const db = createAdminClient();
    const base = () => db.from("vault_panel").select("id", { count: "exact", head: true }).eq("modelo_id", modeloId);
    const [of, sk] = await Promise.all([
      base().like("nombre", `${PREFIJO_OF}%`).is("eliminada_at", null),
      solo === "of" ? Promise.resolve({ count: 1, error: null }) : base().like("nombre", `${PREFIJO_SKRILL}%`).is("eliminada_at", null),
    ]);
    if (of.error || sk.error) return true;
    return (of.count ?? 0) > 0 && (sk.count ?? 0) > 0;
  } catch {
    return true;
  }
}

/** Modelos activas visibles que aun no han dado sus accesos: las compartidas necesitan OnlyFans y Skrill; las privadas, solo OnlyFans. */
export async function modelosSinAccesos(alcance: Alcance): Promise<Array<{ id: string; nombre: string; compartida: boolean }>> {
  try {
    const db = createAdminClient();
    const { data: modelos } = await soloVisibles(db.from("modelos").select("id, nombre, ambito").eq("activa", true).not("portal_token", "is", null), alcance, "id");
    if (!modelos?.length) return [];
    const { data: entradas, error } = await db
      .from("vault_panel")
      .select("modelo_id, nombre")
      .in("modelo_id", modelos.map((m) => m.id))
      .or(`nombre.like.${PREFIJO_OF}%,nombre.like.${PREFIJO_SKRILL}%`)
      .is("eliminada_at", null);
    if (error) return [];
    const tiene = new Map<string, Set<string>>();
    for (const e of entradas ?? []) {
      const s = tiene.get(e.modelo_id as string) ?? new Set<string>();
      s.add(String(e.nombre).startsWith(PREFIJO_OF) ? "of" : "sk");
      tiene.set(e.modelo_id as string, s);
    }
    return modelos
      .map((m) => ({ id: m.id as string, nombre: m.nombre as string, compartida: m.ambito === "compartido" }))
      .filter((m) => {
        const t = tiene.get(m.id);
        return m.compartida ? (t?.size ?? 0) < 2 : !t?.has("of");
      });
  } catch {
    return [];
  }
}
