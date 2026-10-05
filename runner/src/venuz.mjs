/**
 * Scraper de facturacion de Venuz.ai (app.venuz.ai).
 *
 * Venuz es una SPA que habla con su propia API (crm-api-next.venuz.ai) con sesion por cookies httpOnly.
 * Aqui se hace login con un usuario dedicado (VENUZ_EMAIL / VENUZ_PASSWORD, solo en el .env del VPS),
 * se leen los ingresos por creadora y se guardan en Supabase para que el panel los pinte:
 *   venuz_cuentas            una fila por creadora (vinculable a una modelo del panel)
 *   venuz_ingresos_diarios   neto y bruto por dia y canal (suscripciones, mensajes, tips...)
 *   venuz_resumen_mensual    fans activos, nuevos, renovaciones, reembolsos... por mes
 * Cada vuelta es idempotente (upsert): repetirla solo refresca los numeros.
 */
import { config } from "./config.mjs";

const API = "https://crm-api-next.venuz.ai";
const ORIGEN = "https://app.venuz.ai";
const TROZO_DIAS = 30; // la API se consulta por trozos de ~1 mes
const AGENTE = "venuz-sync";
const AGENTE_PEDIDO = "venuz-sync-pedido";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const entero = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Math.round(Number(v)) : null);
const ymd = (d) => d.toISOString().slice(0, 10);
const sumarDias = (d, n) => new Date(d.getTime() + n * 86400000);
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ---------------------------- sesion con cookies ---------------------------- */

class SesionVenuz {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.cookies = new Map();
  }

  guardarCookies(res) {
    const lista = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const linea of lista) {
      const [par] = linea.split(";");
      const i = par.indexOf("=");
      if (i < 1) continue;
      const nombre = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      if (!valor || /;\s*max-age=0/i.test(linea)) this.cookies.delete(nombre);
      else this.cookies.set(nombre, valor);
    }
  }

  cabeceras(extra = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return {
      Accept: "application/json",
      Origin: ORIGEN,
      Referer: `${ORIGEN}/`,
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    };
  }

  async login() {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: this.cabeceras({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const texto = await res.text();
    let cuerpo = {};
    try {
      cuerpo = JSON.parse(texto);
    } catch {}
    if (JSON.stringify(cuerpo).includes("challenge_required")) {
      throw new Error("Venuz pide verificacion en 2 pasos: el usuario del scraper debe ser uno sin 2FA");
    }
    if (!res.ok) throw new Error(`Login en Venuz rechazado (${res.status}): ${texto.slice(0, 200)}`);
    this.guardarCookies(res);
    if (!this.cookies.size) throw new Error("Login en Venuz sin cookies de sesion: la web cambio su forma de autenticar");
  }

  async refrescar() {
    const res = await fetch(`${API}/api/auth/refresh`, { method: "POST", headers: this.cabeceras() });
    if (!res.ok) return false;
    this.guardarCookies(res);
    return true;
  }

  /** GET JSON; si la sesion caduca renueva (refresh y, si hace falta, login) y reintenta una vez. */
  async get(ruta) {
    for (let intento = 0; intento < 2; intento++) {
      if (!this.cookies.size) await this.login();
      const res = await fetch(`${API}${ruta}`, { headers: this.cabeceras() });
      if (res.status === 401 || res.status === 403) {
        if (intento === 0) {
          if (!(await this.refrescar())) {
            this.cookies.clear();
            await this.login();
          }
          continue;
        }
      }
      if (!res.ok) throw new Error(`Venuz ${ruta.split("?")[0]} respondio ${res.status}`);
      this.guardarCookies(res);
      return res.json();
    }
    throw new Error(`Venuz ${ruta.split("?")[0]}: sesion no valida tras renovar`);
  }
}

/* ------------------------------- extraccion -------------------------------- */

export function filasDiarias(cuentaId, resp) {
  const porFecha = new Map();
  const fila = (fecha) => {
    if (!porFecha.has(fecha)) {
      porFecha.set(fecha, {
        cuenta_id: cuentaId, fecha,
        suscripciones: 0, mensajes: 0, tips: 0, posts: 0, referidos: 0, streams: 0, total: 0,
        suscripciones_bruto: 0, mensajes_bruto: 0, tips_bruto: 0, posts_bruto: 0, referidos_bruto: 0, streams_bruto: 0, total_bruto: 0,
      });
    }
    return porFecha.get(fecha);
  };
  const conTotal = new Set();
  for (const d of resp.daily_data ?? []) {
    if (!d?.date) continue;
    const f = fila(d.date.slice(0, 10));
    f.total = num(d.revenue);
    f.total_bruto = num(d.gross);
    conTotal.add(f.fecha);
  }
  for (const d of resp.daily_by_channel ?? []) {
    if (!d?.date) continue;
    const f = fila(d.date.slice(0, 10));
    f.suscripciones = num(d.subscriptions); f.suscripciones_bruto = num(d.subscriptions_gross);
    f.mensajes = num(d.messages);           f.mensajes_bruto = num(d.messages_gross);
    f.tips = num(d.tips);                   f.tips_bruto = num(d.tips_gross);
    f.posts = num(d.posts);                 f.posts_bruto = num(d.posts_gross);
    f.referidos = num(d.referrals);         f.referidos_bruto = num(d.referrals_gross);
    f.streams = num(d.streams);             f.streams_bruto = num(d.streams_gross);
    if (!conTotal.has(f.fecha)) {
      f.total = num(f.suscripciones + f.mensajes + f.tips + f.posts + f.referidos + f.streams);
      f.total_bruto = num(f.suscripciones_bruto + f.mensajes_bruto + f.tips_bruto + f.posts_bruto + f.referidos_bruto + f.streams_bruto);
    }
  }
  return [...porFecha.values()];
}

export function filaMensual(m, mes) {
  return {
    cuenta_id: m.account_id,
    mes,
    total_neto: num(m.of_total_revenue ?? m.total_revenue),
    total_bruto: num(m.of_total_gross ?? m.total_gross ?? m.total_revenue_gross),
    suscripciones: num(m.of_sub_revenue ?? m.sub_revenue),
    tips: num(m.of_tip_revenue ?? m.tip_revenue),
    ppv: num(m.of_ppv_revenue ?? m.ppv_revenue),
    posts: num(m.of_post_revenue),
    reembolsos: num(m.chargeback_amount),
    fans_activos: entero(m.fans_active ?? m.active_subscribers),
    fans_nuevos: entero(m.of_new_subs ?? m.new_sub_count),
    renovaciones: entero(m.of_renewals ?? m.renewal_count),
    ventas: entero(m.total_sales_count),
    gasto_medio_fan: m.revenue_per_fan === null || m.revenue_per_fan === undefined ? null : num(m.revenue_per_fan),
    actualizado_at: new Date().toISOString(),
  };
}

async function upsertEnTrozos(supabase, tabla, filas, onConflict) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from(tabla).upsert(filas.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

/** Vincula a una modelo del panel las cuentas nuevas cuyo nombre coincida de forma inequivoca. */
async function vincularNuevas(supabase) {
  const [{ data: cuentas }, { data: modelos }] = await Promise.all([
    supabase.from("venuz_cuentas").select("id, nombre, username, modelo_id, vinculo_manual"),
    supabase.from("modelos").select("id, nombre"),
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

/* --------------------------------- sincronizar ------------------------------ */

export async function sincronizarVenuz(supabase, { dias } = {}) {
  const sesion = new SesionVenuz(config.venuzEmail, config.venuzPassword);
  const hoy = new Date();
  const hoyStr = ymd(hoy);

  const crudo = await sesion.get("/api/accounts");
  const lista = Array.isArray(crudo) ? crudo : crudo?.accounts ?? crudo?.data ?? [];
  if (!lista.length) throw new Error("Venuz no devolvio ninguna cuenta (el usuario del scraper no tiene creadoras asignadas?)");

  const ahora = new Date().toISOString();
  await upsertEnTrozos(
    supabase,
    "venuz_cuentas",
    lista.map((a) => ({
      id: a.id,
      nombre: a.custom_display_name || a.display_name || a.username || a.id,
      username: a.username ?? null,
      avatar_url: a.avatar_url ?? null,
      activa: a.is_active !== false,
      estado_conexion: a.connection_status ?? a.session_status ?? null,
      suscriptores: entero(a.subscribers_count),
      ultima_sync_at: ahora,
      updated_at: ahora,
    })),
    "id",
  );

  // Primera vez (sin datos): historico largo. Despues, solo una ventana reciente que se re-lee entera
  // porque Venuz ajusta los ultimos dias (reembolsos, ventas tardias).
  const { count } = await supabase.from("venuz_ingresos_diarios").select("cuenta_id", { count: "exact", head: true });
  const ventana = dias ?? (count ? config.venuzDias : Math.max(config.venuzDias, 150));

  const problemas = [];
  let diasGuardados = 0;
  for (const cuenta of lista) {
    const nombre = cuenta.display_name || cuenta.username || cuenta.id;
    try {
      const porFecha = new Map();
      for (let atras = ventana; atras > 0; atras -= TROZO_DIAS) {
        const desde = ymd(sumarDias(hoy, -(atras - 1)));
        const hasta = ymd(sumarDias(hoy, -Math.max(0, atras - TROZO_DIAS)));
        const q = `startDate=${desde}&endDate=${hasta > hoyStr ? hoyStr : hasta}&accountId=${cuenta.id}`;
        const resp = await sesion.get(`/api/dashboard/revenue?${q}`);
        if (resp.failed_account_ids?.length || resp.disconnected_account_ids?.length) {
          problemas.push(`${nombre}: Venuz la marca como fallida/desconectada, datos posiblemente incompletos`);
        }
        for (const f of filasDiarias(cuenta.id, resp)) porFecha.set(f.fecha, f);
      }
      const filas = [...porFecha.values()].map((f) => ({ ...f, actualizado_at: ahora }));
      await upsertEnTrozos(supabase, "venuz_ingresos_diarios", filas, "cuenta_id,fecha");
      diasGuardados += filas.length;
    } catch (err) {
      problemas.push(`${nombre}: ${err.message}`);
    }
  }

  // Foto mensual (mes actual y anterior; si es la primera vez, 5 meses).
  const meses = count ? 2 : 5;
  let mesesGuardados = 0;
  for (let k = 0; k < meses; k++) {
    const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - k, 1));
    const fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0));
    const hasta = ymd(fin) > hoyStr ? hoyStr : ymd(fin);
    try {
      const resp = await sesion.get(`/api/analytics/model-performance?from=${ymd(inicio)}&to=${hasta}&mode=net`);
      const filas = (resp.models ?? []).filter((m) => m?.account_id).map((m) => filaMensual(m, ymd(inicio)));
      if (filas.length) await upsertEnTrozos(supabase, "venuz_resumen_mensual", filas, "cuenta_id,mes");
      mesesGuardados += filas.length;
    } catch (err) {
      problemas.push(`resumen ${ymd(inicio).slice(0, 7)}: ${err.message}`);
    }
  }

  const vinculadas = await vincularNuevas(supabase);
  return { cuentas: lista.length, diasGuardados, mesesGuardados, vinculadas, ventanaDias: ventana, problemas };
}

/* ------------------------- ciclo (programado + manual) ---------------------- */

let enMarcha = false;
let ultimoIntento = 0;
let ultimaOk = 0;
let avisadoSinCredenciales = false;
let primeraComprobacion = true;

async function registrar(supabase, resultado, accion, detalle, duracionMs) {
  const { error } = await supabase
    .from("log_agentes")
    .insert({ agente: AGENTE, accion, resultado, detalle, duracion_ms: duracionMs });
  if (error) console.error("[venuz] no se pudo registrar en log_agentes:", error.message);
}

/** Se llama cada ~30 s: lanza la sincronizacion si toca por horario o si el panel la ha pedido. */
export async function cicloVenuz(supabase) {
  if (enMarcha) return;
  if (!config.venuzEmail || !config.venuzPassword) {
    if (!avisadoSinCredenciales) {
      console.log("[venuz] sin VENUZ_EMAIL / VENUZ_PASSWORD en el .env: facturacion desactivada");
      avisadoSinCredenciales = true;
    }
    return;
  }

  enMarcha = true;
  try {
    if (primeraComprobacion) {
      primeraComprobacion = false;
      const { data } = await supabase
        .from("log_agentes").select("created_at").eq("agente", AGENTE).eq("accion", "sync").eq("resultado", "ok")
        .order("created_at", { ascending: false }).limit(1);
      if (data?.[0]) ultimaOk = new Date(data[0].created_at).getTime();
    }

    const { data: pedido } = await supabase
      .from("log_agentes").select("created_at").eq("agente", AGENTE_PEDIDO)
      .order("created_at", { ascending: false }).limit(1);
    const pedidoAt = pedido?.[0] ? new Date(pedido[0].created_at).getTime() : 0;

    const ahora = Date.now();
    const porHorario = ahora - ultimaOk >= config.venuzHoras * 3600000 && ahora - ultimoIntento >= 30 * 60000;
    const porPedido = pedidoAt > ultimoIntento;
    if (!porHorario && !porPedido) return;

    ultimoIntento = ahora;
    const t0 = Date.now();
    try {
      const r = await sincronizarVenuz(supabase);
      const resultado = r.problemas.length ? (r.diasGuardados ? "parcial" : "error") : "ok";
      if (resultado !== "error") ultimaOk = Date.now();
      await registrar(supabase, resultado, "sync", { origen: porPedido ? "manual" : "programado", ...r }, Date.now() - t0);
      console.log(`[venuz] sync ${resultado}: ${r.cuentas} cuentas, ${r.diasGuardados} dias, ${r.mesesGuardados} resumenes mensuales${r.problemas.length ? `, ${r.problemas.length} avisos` : ""}`);
    } catch (err) {
      console.error("[venuz] sync fallida:", err.message);
      await registrar(supabase, "error", "sync", { origen: porPedido ? "manual" : "programado", error: err.message }, Date.now() - t0);
    }
  } catch (err) {
    console.error("[venuz] error inesperado:", err.message);
  } finally {
    enMarcha = false;
  }
}
