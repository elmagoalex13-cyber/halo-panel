/**
 * Facturacion y enlaces de Venuz a traves de su API OFICIAL (open.venuz.ai/v1, con clave VENUZ_API_KEY en el .env del VPS).
 * Complementa al lector por sesion de venuz.mjs (que sigue ahi como respaldo y para el resumen mensual):
 *   - cuentas (creadoras) de Venuz: se guardan y las que ya NO estan en Venuz se desactivan (dejan de salir en el panel)
 *   - ingresos por dia y canal (neto y bruto) de las ultimas semanas: cada ~10 minutos se refrescan los ultimos dias (casi en tiempo real)
 *     y una vez por hora una ventana larga (Venuz ajusta reembolsos y ventas tardias)
 *   - enlaces de seguimiento (clics y suscriptores de cada uno) y ratio de contracargos -> panel_config «venuz_enlaces»
 * Solo LEE: esta clave no se usa para escribir nada en Venuz.
 */
const BASE = "https://open.venuz.ai/v1";
const AGENTE = "venuz_sync";
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

/** Sincroniza cuentas, ingresos y enlaces. `dias` = ventana de ingresos (por defecto la corta). */
export async function sincronizarVenuzApi(supabase, clave, { dias = DIAS_RAPIDO, enlaces = true } = {}) {
  const hoy = new Date();
  const ahora = hoy.toISOString();

  const resp = await llamar(clave, "/accounts");
  const lista = (resp.data ?? []).filter((a) => a?.id);
  if (!lista.length) throw new Error("La clave de Venuz no ve ninguna cuenta (creadoras)");

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

  // Las cuentas que ya no estan en Venuz (borradas) dejan de contar y de salir en el panel; su historico se conserva
  const ids = lista.map((a) => a.id);
  const { data: sobrantes } = await supabase.from("venuz_cuentas").select("id").eq("activa", true).not("id", "in", `(${ids.join(",")})`);
  if (sobrantes?.length) await supabase.from("venuz_cuentas").update({ activa: false, estado_conexion: "disconnected", updated_at: ahora }).in("id", sobrantes.map((s) => s.id));

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
    await supabase.from("panel_config").upsert({ key: "venuz_enlaces", value: { at: ahora, cuentas: salida }, updated_at: ahora });
  }
  return { cuentas: lista.length, diasGuardados, ventanaDias: dias, problemas };
}

/* ------------------------- ciclo (cada ~10 min + peticiones del panel) ---------------------- */

let enMarcha = false;
let ultimoRapido = 0;
let ultimoLargo = 0;
let ultimoErrorLog = 0;
let sinClaveAvisado = false;

async function registrar(supabase, resultado, detalle, ms) {
  const { error } = await supabase.from("log_agentes").insert({ agente: AGENTE, accion: "sync", resultado, detalle, duracion_ms: ms });
  if (error) console.error("[venuz-api] no se pudo registrar en log_agentes:", error.message);
}

/** Se llama cada ~30 s: sincroniza si toca (cada 10 min) o si el panel ha pulsado «Actualizar» (peticion mas reciente que la ultima vuelta). */
export async function cicloVenuzApi(supabase) {
  const clave = (process.env.VENUZ_API_KEY ?? "").trim();
  if (!clave) {
    if (!sinClaveAvisado) {
      console.log("[venuz-api] sin VENUZ_API_KEY en el .env: se usa solo el lector por sesion");
      sinClaveAvisado = true;
    }
    return;
  }
  if (enMarcha) return;
  enMarcha = true;
  try {
    const { data: pedido } = await supabase.from("log_agentes").select("created_at").eq("agente", AGENTE).eq("accion", "solicitud").order("created_at", { ascending: false }).limit(1);
    const pedidoAt = pedido?.[0] ? new Date(pedido[0].created_at).getTime() : 0;
    const ahora = Date.now();
    const porPedido = pedidoAt > ultimoRapido;
    if (!porPedido && ahora - ultimoRapido < CADA_RAPIDO_MS) return;

    const largo = porPedido || ahora - ultimoLargo >= CADA_LARGO_MS;
    ultimoRapido = ahora;
    const t0 = Date.now();
    try {
      const r = await sincronizarVenuzApi(supabase, clave, { dias: largo ? DIAS_LARGO : DIAS_RAPIDO });
      if (largo) ultimoLargo = ahora;
      // Solo se deja constancia en el registro (la hora de «Actualizado» del panel) cuando algo se ha guardado
      if (r.diasGuardados || !r.problemas.length) await registrar(supabase, r.problemas.length && !r.diasGuardados ? "error" : "ok", { origen: porPedido ? "manual" : "api", ...r }, Date.now() - t0);
      console.log(`[venuz-api] ${largo ? "ventana larga" : "rapida"}: ${r.cuentas} cuentas, ${r.diasGuardados} dias${r.problemas.length ? `, ${r.problemas.length} avisos: ${r.problemas[0]}` : ""}`);
    } catch (e) {
      console.error("[venuz-api] sync fallida:", e.message);
      if (Date.now() - ultimoErrorLog > 3600000) {
        ultimoErrorLog = Date.now();
        await registrar(supabase, "error", { origen: "api", error: e.message }, Date.now() - t0);
      }
    }
  } finally {
    enMarcha = false;
  }
}
