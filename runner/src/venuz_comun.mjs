/**
 * Piezas comunes de la integracion con Venuz.
 *
 * Puede haber MAS DE UNA cuenta de Venuz (agencia): la del dueno y, cuando se active, la del socio. Cada una tiene su propia
 * clave de API (para leer facturacion y enlaces) y su propio usuario y contrasena (para programar posts). Se configuran en el .env del VPS:
 *   dueno: VENUZ_API_KEY, VENUZ_EMAIL, VENUZ_PASSWORD
 *   socio: VENUZ_API_KEY_SOCIO, VENUZ_EMAIL_SOCIO, VENUZ_PASSWORD_SOCIO
 * Cada creadora (cuenta de Venuz) pertenece a UNA de ellas: se anota en panel_config «venuz_origen» ({ cuentaId: "dueno" | "socio" }),
 * y lo que no consta se considera del dueno. Asi los posts de una modelo se programan siempre con la cuenta de Venuz que le corresponde.
 */

export const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Las cuentas de Venuz configuradas (las que tienen algo en el .env). */
export function agenciasVenuz(env = process.env) {
  const t = (v) => String(v ?? "").trim();
  const lista = [
    { etiqueta: "dueno", nombre: "tu cuenta", apiKey: t(env.VENUZ_API_KEY), email: t(env.VENUZ_EMAIL), password: String(env.VENUZ_PASSWORD ?? "") },
    { etiqueta: "socio", nombre: "la cuenta de tu socio", apiKey: t(env.VENUZ_API_KEY_SOCIO), email: t(env.VENUZ_EMAIL_SOCIO), password: String(env.VENUZ_PASSWORD_SOCIO ?? "") },
  ];
  return lista.filter((a) => a.apiKey || (a.email && a.password));
}

const CLAVE_ORIGEN = "venuz_origen";

/** { cuentaId: "dueno" | "socio" } */
export async function leerOrigen(supabase) {
  const { data } = await supabase.from("panel_config").select("value").eq("key", CLAVE_ORIGEN).maybeSingle();
  return data?.value && typeof data.value === "object" ? data.value : {};
}

/** Anota de que cuenta de Venuz es cada creadora y devuelve el mapa completo. */
export async function guardarOrigen(supabase, etiqueta, ids) {
  const mapa = await leerOrigen(supabase);
  let cambio = false;
  for (const id of ids) {
    if (mapa[id] !== etiqueta) {
      mapa[id] = etiqueta;
      cambio = true;
    }
  }
  if (cambio) await supabase.from("panel_config").upsert({ key: CLAVE_ORIGEN, value: mapa, updated_at: new Date().toISOString() });
  return mapa;
}

/** Desactiva las creadoras de ESTA cuenta de Venuz que ya no aparecen en su lista (se borraron); las de otra cuenta no se tocan. Devuelve cuantas. */
export async function desactivarAusentes(supabase, etiqueta, idsPresentes, mapaOrigen) {
  const presentes = new Set(idsPresentes);
  const { data: activas } = await supabase.from("venuz_cuentas").select("id").eq("activa", true);
  const sobrantes = (activas ?? []).map((c) => c.id).filter((id) => !presentes.has(id) && (mapaOrigen[id] ?? "dueno") === etiqueta);
  if (sobrantes.length) {
    await supabase.from("venuz_cuentas").update({ activa: false, estado_conexion: "disconnected", updated_at: new Date().toISOString() }).in("id", sobrantes);
  }
  return sobrantes;
}

/** Vincula a una modelo del panel las cuentas nuevas cuyo nombre coincida de forma inequivoca. */
export async function vincularNuevas(supabase) {
  const [{ data: cuentas }, { data: modelos }] = await Promise.all([
    supabase.from("venuz_cuentas").select("id, nombre, username, modelo_id, vinculo_manual").eq("activa", true),
    supabase.from("modelos").select("id, nombre").is("eliminada_at", null),
  ]);
  const yaUsadas = new Set((cuentas ?? []).filter((c) => c.modelo_id).map((c) => c.modelo_id));
  let vinculadas = 0;
  for (const c of (cuentas ?? []).filter((x) => !x.modelo_id && !x.vinculo_manual)) {
    const claves = [normalizar(c.nombre), normalizar(c.username)].filter((k) => k.length >= 3);
    const candidatas = (modelos ?? []).filter((m) => {
      if (yaUsadas.has(m.id)) return false;
      const n = normalizar(m.nombre);
      return n.length >= 3 && claves.some((k) => k === n || (n.length >= 4 && k.includes(n)) || (k.length >= 4 && n.includes(k)));
    });
    if (candidatas.length !== 1) continue;
    const { error } = await supabase.from("venuz_cuentas").update({ modelo_id: candidatas[0].id }).eq("id", c.id).is("modelo_id", null);
    if (!error) {
      yaUsadas.add(candidatas[0].id);
      vinculadas++;
    }
  }
  return vinculadas;
}
