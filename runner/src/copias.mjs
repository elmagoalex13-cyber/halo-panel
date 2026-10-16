/**
 * Detecta SOLO (sin pegar enlaces) cuales de los reels que guarda el buscador son COPIAS nuestras (trial reels ya publicados) o repeticiones de otro reel
 * mas antiguo de la misma cuenta: se compara la huella visual (huella.mjs) con la de las versiones que generamos y con la de los originales anteriores.
 *  - Si coincide con una version nuestra: se enlaza esa version con el reel publicado (queda como programada/publicada, con sus visitas).
 *  - Si coincide con un original mas antiguo: es una copia de ese original.
 * Las copias detectadas quedan en panel_config.virales_copias y el panel las oculta como originales y no las usa como fuente de trials.
 */
import { rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { downloadFromR2 } from "./r2.mjs";
import { UMBRAL_COPIA, huellaVideo, parecido } from "./huella.mjs";

const CLAVE = "virales_copias"; // { hashes: { codigo: [6 huellas] }, copias: { codigo: { de, tipo, dist, at } } }
const CLAVE_PEDIDOS = "trial_reels_pedidos";
const POR_CICLO = 4; // reels nuevos a «huellar» en cada vuelta (cada uno son unos segundos)

async function leer(sb, clave) {
  const { data } = await sb.from("panel_config").select("value, updated_at").eq("key", clave).maybeSingle();
  return { valor: data?.value ?? null, updated_at: data?.updated_at ?? null };
}

/** Cambia un valor de panel_config con «comparar y cambiar»; fn recibe el valor actual y devuelve el nuevo (o null si no hay nada que cambiar). */
async function cambiar(sb, clave, fn) {
  for (let i = 0; i < 6; i++) {
    const { valor, updated_at } = await leer(sb, clave);
    const nuevo = fn(valor);
    if (nuevo === null) return true;
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await sb.from("panel_config").insert({ key: clave, value: nuevo, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data } = await sb.from("panel_config").update({ value: nuevo, updated_at: ahora }).eq("key", clave).eq("updated_at", updated_at).select("key");
      if (data?.length) return true;
    }
  }
  return false;
}

let ocupado = false;

export async function cicloCopias(sb) {
  if (ocupado) return;
  ocupado = true;
  try {
    const { data: filas } = await sb.from("virales_propios").select("codigo, cuenta_id, video_key, fecha_publicacion").limit(1500);
    const rows = (filas ?? []).filter((r) => r.video_key && r.codigo);
    if (!rows.length) return;
    let { valor } = await leer(sb, CLAVE);
    const hashes = { ...(valor?.hashes ?? {}) };

    // 1) huella de los reels que aun no la tienen
    const nuevos = rows.filter((r) => !hashes[r.codigo]).slice(0, POR_CICLO);
    for (const r of nuevos) {
      const tmp = path.join(config.tmpDir, "copias", `${r.codigo}.mp4`);
      try {
        await downloadFromR2(r.video_key, tmp);
        const h = await huellaVideo(tmp);
        await cambiar(sb, CLAVE, (v) => ({ hashes: { ...(v?.hashes ?? {}), [r.codigo]: h }, copias: v?.copias ?? {} }));
        hashes[r.codigo] = h;
      } catch (e) {
        console.error(`[copias] ${r.codigo}: ${e.message}`);
        hashes[r.codigo] = []; // no insistir con un video que no se puede leer
      } finally {
        await rm(tmp, { force: true }).catch(() => undefined);
      }
    }

    // 2) comparar: version nuestra mas parecida (si el reel es posterior a su generacion) y, si no, original mas antiguo de la misma cuenta
    ({ valor } = await leer(sb, CLAVE));
    const copias = { ...(valor?.copias ?? {}) };
    const { valor: pedidosValor } = await leer(sb, CLAVE_PEDIDOS);
    const pedidos = Array.isArray(pedidosValor?.pedidos) ? pedidosValor.pedidos : [];
    const cuentaDeViral = new Map();
    {
      const ids = [...new Set(pedidos.map((p) => p.viral_id))];
      if (ids.length) {
        const { data } = await sb.from("virales_propios").select("id, cuenta_id").in("id", ids);
        for (const v of data ?? []) cuentaDeViral.set(v.id, v.cuenta_id);
      }
    }
    const enlaces = []; // [pedidoId, n, codigo]
    const nuevasCopias = {};
    const fechaDe = (r) => (r.fecha_publicacion ? new Date(r.fecha_publicacion).getTime() : null);
    for (const r of rows) {
      const h = hashes[r.codigo];
      if (!h?.length || copias[r.codigo]) continue;
      const t = fechaDe(r);
      if (t === null) continue;
      // a) con una version nuestra
      let mejor = null;
      for (const p of pedidos) {
        if (cuentaDeViral.get(p.viral_id) !== r.cuenta_id) continue;
        if (t < new Date(p.at).getTime()) continue; // lo publicado antes de pedir la version no puede ser esa copia
        for (const v of p.variantes ?? []) {
          if (v.ig_codigo && v.ig_codigo !== r.codigo) continue; // esa version ya tiene su reel
          const d = parecido(h, v.hash);
          if (d <= UMBRAL_COPIA && (!mejor || d < mejor.d)) mejor = { d, pedido: p.id, n: v.n, viral: p.viral_id };
        }
      }
      if (mejor) {
        nuevasCopias[r.codigo] = { de: null, tipo: "version", dist: Math.round(mejor.d * 10) / 10, at: new Date().toISOString() };
        enlaces.push([mejor.pedido, mejor.n, r.codigo]);
        continue;
      }
      // b) con un original mas antiguo de la misma cuenta
      let origen = null;
      for (const o of rows) {
        if (o.codigo === r.codigo || o.cuenta_id !== r.cuenta_id || copias[o.codigo] || nuevasCopias[o.codigo]) continue;
        const to = fechaDe(o);
        if (to === null || to >= t - 60 * 60 * 1000) continue; // el original es el mas antiguo
        const d = parecido(h, hashes[o.codigo]);
        if (d <= UMBRAL_COPIA && (!origen || d < origen.d)) origen = { d, codigo: o.codigo };
      }
      if (origen) nuevasCopias[r.codigo] = { de: origen.codigo, tipo: "original", dist: Math.round(origen.d * 10) / 10, at: new Date().toISOString() };
    }

    if (Object.keys(nuevasCopias).length) {
      await cambiar(sb, CLAVE, (v) => ({ hashes: v?.hashes ?? hashes, copias: { ...(v?.copias ?? {}), ...nuevasCopias } }));
      console.log(`[copias] ${Object.keys(nuevasCopias).length} copia(s) nuestra(s) detectada(s): ${Object.keys(nuevasCopias).join(", ")}`);
    }
    if (enlaces.length) {
      await cambiar(sb, CLAVE_PEDIDOS, (v) => {
        const lista = Array.isArray(v?.pedidos) ? v.pedidos : [];
        let hay = false;
        const nueva = lista.map((p) => ({
          ...p,
          variantes: (p.variantes ?? []).map((x) => {
            const e = enlaces.find(([pid, n]) => pid === p.id && n === x.n);
            if (!e || x.ig_codigo) return x;
            hay = true;
            return { ...x, ig_codigo: e[2], ig_url: `https://www.instagram.com/reel/${e[2]}/`, programado_at: x.programado_at ?? new Date().toISOString(), programado_por: x.programado_por ?? "automático" };
          }),
        }));
        return hay ? { pedidos: nueva } : null;
      });
    }
  } catch (e) {
    console.error("[copias] error inesperado:", e.message);
  } finally {
    ocupado = false;
  }
}
