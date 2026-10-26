/**
 * Facturacion y enlaces de Venuz a traves de su API OFICIAL (open.venuz.ai/v1), con la clave de cada cuenta de Venuz (la tuya: VENUZ_API_KEY;
 * la de tu socio, cuando la haya: VENUZ_API_KEY_SOCIO). Complementa al lector por sesion de venuz.mjs (que sigue como respaldo y para el resumen mensual):
 *   - creadoras (cuentas) de Venuz: se guardan y vinculan a su modelo; las que ya NO estan en Venuz se desactivan (dejan de salir en el panel).
 *     Se revisan cada minuto: una creadora nueva (o borrada) se nota en el panel en uno o dos minutos.
 *   - ingresos por dia y canal (neto y bruto): cada ~10 minutos los ultimos dias (casi en tiempo real) y cada hora una ventana larga (Venuz ajusta reembolsos y ventas tardias)
 *   - enlaces de seguimiento (clics y suscriptores) y ratio de contracargos -> panel_config «venuz_enlaces»
 * Solo LEE: estas claves no se usan para escribir nada en Venuz.
 */
import { agenciasVenuz, desactivarAusentes, guardarOrigen, vincularNuevas } from "./venuz_comun.mjs";

const BASE = "https://open.venuz.ai/v1";
const AGENTE = "venuz_sync";
const CADA_CUENTAS_MS = 60000;
const CADA_RAPIDO_MS = 10 * 60000;
const CADA_LARGO_MS = 60 * 60000;
const DIAS_RAPIDO = 3;
const DIAS_LARGO = 45;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const ymd = (d) => d.toISOString().slice(0, 10);
const sumarDias = (d, n) => new Date(d.getTime() + n * 86400000);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function llamar(clave, ruta) {
  for (let intento = 0; intento < 3; intento++) {
    const res = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${clave}` } });
    if (res.status === 429 && intento < 2) {
      await espera(Math.min(30, Number(res.headers.get("retry-after")) || 5) * 1000);
      continue;
    }
    const texto = await res.text();
    let cuerpo = null;
    try {
      cuerpo = JSON.parse(texto);
    } catch {}
    if (!res.ok) throw new Error(`Venuz API ${ruta.split("?")[0]} -> ${res.status} ${cuerpo?.error ?? ""} ${String(cuerpo?.message ?? texto).slice(0, 140)}`.trim());
    return cuerpo;
  }
  throw new Error(`Venuz API ${ruta.split("?")[0]}: demasiadas peticiones`);
}

/** Una fila de venuz_ingresos_diarios a partir de un dia de analytics/revenue (mismas columnas que el lector por sesion). */
export function filaDia(cuentaId, d) {
  const c = d.channels ?? {};
  const neto = (k) => num(c[k]?.net_usd);
  const bruto = (k) => num(c[k]?.gross_usd);
  return {
    cuenta_id: cuentaId,
    fecha: String(d.date).slice(0, 10),
    suscripciones: neto("subscriptions"), mensajes: neto("messages"), tips: neto("tips"), posts: neto("posts"), referidos: neto("referrals"), streams: neto("streams"),
    total: num(d.net_usd),
    suscripciones_bruto: bruto("subscriptions"), mensajes_bruto: bruto("messages"), tips_bruto: bruto("tips"), posts_bruto: bruto("posts"), referidos_bruto: bruto("referrals"), streams_bruto: bruto("streams"),
    total_bruto: num(d.gross_usd),
  };
}

async function upsertEnTrozos(supabase, tabla, filas, onConflict) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from(tabla).upsert(filas.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

const vacias = new Map(); // etiqueta -> vueltas seguidas con la lista de cuentas vacia (para no desactivar todo por un fallo puntual)

/** Creadoras de esta cuenta de Venuz: las guarda, anota de quien son, desactiva las borradas y vincula las nuevas. Devuelve la lista. */
export async function sincronizarCuentas(supabase, clave, etiqueta) {
  const ahora = new Date().toISOString();
  const resp = await llamar(clave, "/accounts");
  const lista = (resp.data ?? []).filter((a) => a?.id);
  if (!lista.length) {
    const n = (vacias.get(etiqueta) ?? 0) + 1;
    vacias.set(etiqueta, n);
    if (n >= 2) {
      const mapa = await guardarOrigen(supabase, etiqueta, []);
      await desactivarAusentes(supabase, etiqueta, [], mapa);
    }
    return [];
  }
  vacias.set(etiqueta, 0);

  const mapa = await guardarOrigen(supabase, etiqueta, lista.map((a) => a.id));
  await upsertEnTrozos(
    supabase,
    "venuz_cuentas",
    lista.map((a) => ({
      id: a.id,
      nombre: a.name || a.username || a.id,
      username: a.username ?? null,
      activa: a.active !== false && !a.deleting,
      estado_conexion: a.connection?.state === "connected" ? "hot" : "disconnected",
      suscriptores: Number.isFinite(Number(a.subscribers_count)) ? Math.round(Number(a.subscribers_count)) : null,
      ultima_sync_at: ahora,
      updated_at: ahora,
    })),
    "id",
  );
  await desactivarAusentes(supabase, etiqueta, lista.map((a) => a.id), mapa);
  await vincularNuevas(supabase);
  return lista;
}

/** Ingresos (ultimos `dias`) y enlaces de las cuentas de esta cuenta de Venuz. */
export async function sincronizarIngresos(supabase, clave, lista, { dias = DIAS_RAPIDO, enlaces = true } = {}) {
  const hoy = new Date();
  const ahora = hoy.toISOString();
  const problemas = [];
  let diasGuardados = 0;
  const desde = ymd(sumarDias(hoy, -(dias - 1)));
  const hasta = ymd(hoy);
  const salida = {};
  for (const a of lista) {
    try {
      const r = await llamar(clave, `/accounts/${a.id}/analytics/revenue?date_from=${desde}&date_to=${hasta}`);
      const filas = (r.data?.daily ?? []).filter((d) => d?.date).map((d) => ({ ...filaDia(a.id, d), actualizado_at: ahora }));
      if (filas.length) await upsertEnTrozos(supabase, "venuz_ingresos_diarios", filas, "cuenta_id,fecha");
      diasGuardados += filas.length;
    } catch (e) {
      problemas.push(`${a.name ?? a.id}: ${e.message}`);
    }
    if (!enlaces) continue;
    try {
      const todos = [];
      let cursor = null;
      do {
        const r = await llamar(clave, `/accounts/${a.id}/links/tracking?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        todos.push(...(r.data ?? []));
        cursor = r.next_cursor ?? null;
      } while (cursor && todos.length < 500);
      let contracargos = null;
      try {
        contracargos = (await llamar(clave, `/accounts/${a.id}/payouts/chargeback-ratio`)).data?.chargeback_ratio_pct ?? null;
      } catch {
        /* opcional */
      }
      salida[a.id] = {
        nombre: a.name ?? a.username ?? a.id,
        suscriptores: Number.isFinite(Number(a.subscribers_count)) ? Number(a.subscribers_count) : null,
        contracargos_pct: contracargos,
        enlaces: todos.map((l) => ({ id: String(l.id), nombre: l.name ?? "", url: l.share_url ?? null, clics: Number(l.clicks) || 0, suscriptores: Number(l.subscribers) || 0, creado: l.created_at ?? null, termina: l.ends_at ?? null })),
      };
    } catch (e) {
      problemas.push(`enlaces ${a.name ?? a.id}: ${e.message}`);
    }
  }
  if (enlaces && Object.keys(salida).length) {
    // Se conservan los enlaces de las cuentas de la OTRA cuenta de Venuz y se renuevan los de estas
    const { data: previo } = await supabase.from("panel_config").select("value").eq("key", "venuz_enlaces").maybeSingle();
    const cuentas = { ...((previo?.value?.cuentas ?? {})), ...salida };
    await supabase.from("panel_config").upsert({ key: "venuz_enlaces", value: { at: ahora, cuentas }, updated_at: ahora });
  }
  return { diasGuardados, ventanaDias: dias, problemas };
}

/** Todo de una vez (lo usan las pruebas y el boton de actualizar). */
export async function sincronizarVenuzApi(supabase, clave, { etiqueta = "dueno", dias = DIAS_RAPIDO, enlaces = true } = {}) {
  const lista = await sincronizarCuentas(supabase, clave, etiqueta);
  if (!lista.length) throw new Error("La clave de Venuz no ve ninguna cuenta (creadoras)");
  const r = await sincronizarIngresos(supabase, clave, lista, { dias, enlaces });
  return { cuentas: lista.length, ...r };
}

/* ------------------------- ciclo (cada minuto: cuentas; cada 10 min: ingresos; peticiones del panel) ---------------------- */

const estado = new Map(); // etiqueta -> { enMarcha, cuentas, rapido, largo, errorLog }
let sinClaveAvisado = false;

async function registrar(supabase, resultado, detalle, ms) {
  const { error } = await supabase.from("log_agentes").insert({ agente: AGENTE, accion: "sync", resultado, detalle, duracion_ms: ms });
  if (error) console.error("[venuz-api] no se pudo registrar en log_agentes:", error.message);
}

async function cicloAgencia(supabase, ag, pedidoAt) {
  const e = estado.get(ag.etiqueta) ?? { enMarcha: false, cuentas: 0, rapido: 0, largo: 0, errorLog: 0, lista: [] };
  estado.set(ag.etiqueta, e);
  if (e.enMarcha) return;
  const ahora = Date.now();
  const porPedido = pedidoAt > e.cuentas;
  if (!porPedido && ahora - e.cuentas < CADA_CUENTAS_MS) return;
  e.enMarcha = true;
  e.cuentas = ahora;
  const t0 = Date.now();
  try {
    e.lista = await sincronizarCuentas(supabase, ag.apiKey, ag.etiqueta);
    const toca = porPedido || ahora - e.rapido >= CADA_RAPIDO_MS;
    if (!toca || !e.lista.length) return;
    const largo = porPedido || ahora - e.largo >= CADA_LARGO_MS;
    e.rapido = ahora;
    const r = await sincronizarIngresos(supabase, ag.apiKey, e.lista, { dias: largo ? DIAS_LARGO : DIAS_RAPIDO });
    if (largo) e.largo = ahora;
    // Solo se deja constancia en el registro (la hora de «Actualizado» del panel) cuando algo se ha guardado
    if (r.diasGuardados || !r.problemas.length) await registrar(supabase, r.problemas.length && !r.diasGuardados ? "error" : "ok", { origen: porPedido ? "manual" : "api", cuenta_venuz: ag.etiqueta, cuentas: e.lista.length, ...r }, Date.now() - t0);
    console.log(`[venuz-api:${ag.etiqueta}] ${largo ? "ventana larga" : "rapida"}: ${e.lista.length} cuentas, ${r.diasGuardados} dias${r.problemas.length ? `, ${r.problemas.length} avisos: ${r.problemas[0]}` : ""}`);
  } catch (err) {
    console.error(`[venuz-api:${ag.etiqueta}] sync fallida:`, err.message);
    if (Date.now() - e.errorLog > 3600000) {
      e.errorLog = Date.now();
      await registrar(supabase, "error", { origen: "api", cuenta_venuz: ag.etiqueta, error: err.message }, Date.now() - t0);
    }
  } finally {
    e.enMarcha = false;
  }
}

/** Se llama cada ~30 s: por cada cuenta de Venuz con clave, revisa sus creadoras cada minuto y sus ingresos cada 10, o al momento si el panel ha pulsado «Actualizar». */
export async function cicloVenuzApi(supabase) {
  const agencias = agenciasVenuz().filter((a) => a.apiKey);
  if (!agencias.length) {
    if (!sinClaveAvisado) {
      console.log("[venuz-api] sin VENUZ_API_KEY en el .env: se usa solo el lector por sesion");
      sinClaveAvisado = true;
    }
    return;
  }
  const { data: pedido } = await supabase.from("log_agentes").select("created_at").eq("agente", AGENTE).eq("accion", "solicitud").order("created_at", { ascending: false }).limit(1);
  const pedidoAt = pedido?.[0] ? new Date(pedido[0].created_at).getTime() : 0;
  await Promise.all(agencias.map((ag) => cicloAgencia(supabase, ag, pedidoAt)));
}
