/**
 * Trial reels (seccion «Trial reels» del panel). El panel apunta un pedido por cada video viral de una modelo (panel_config.trial_reels_pedidos);
 * aqui, por cada pedido, se saca el video viral de R2 y se generan 3 versiones «nuevas» (spoofer: pequeños ajustes de zoom, color, brillo, filtro,
 * sin metadatos) que se guardan en R2 (trial-reels/<cuenta>/...). La persona las descarga y las programa a mano.
 * Este ciclo no toca el sistema automatico de trials (trials.mjs, library_content).
 */
import { rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { downloadFromR2, existeEnR2, uploadToR2 } from "./r2.mjs";
import { VARIANTES_TRIAL, paramsTrial, resumenTrial, spoofearTrial } from "./spoofer.mjs";

const CLAVE = "trial_reels_pedidos";
const ATASCADO_MS = 25 * 60 * 1000; // un pedido «procesando» desde hace mas de esto se reintenta (se cayo el runner)

async function leer(sb) {
  const { data } = await sb.from("panel_config").select("value, updated_at").eq("key", CLAVE).maybeSingle();
  return { pedidos: Array.isArray(data?.value?.pedidos) ? data.value.pedidos : [], updated_at: data?.updated_at ?? null };
}

/** Cambia UN pedido con «comparar y cambiar» (el panel tambien escribe en esta lista). */
async function cambiar(sb, id, fn) {
  for (let i = 0; i < 6; i++) {
    const { pedidos, updated_at } = await leer(sb);
    const p = pedidos.find((x) => x.id === id);
    if (!p || !updated_at) return null; // lo borraron mientras tanto
    const nuevo = fn({ ...p });
    const lista = pedidos.map((x) => (x.id === id ? nuevo : x));
    const { data } = await sb.from("panel_config").update({ value: { pedidos: lista }, updated_at: new Date().toISOString() }).eq("key", CLAVE).eq("updated_at", updated_at).select("key");
    if (data?.length) return nuevo;
  }
  return null;
}

let ocupado = false;

export async function cicloTrialReels(sb) {
  if (ocupado) return;
  ocupado = true;
  try {
    const { pedidos } = await leer(sb);
    const ahora = Date.now();
    // Atascados: vuelven a la cola
    for (const p of pedidos.filter((x) => x.estado === "procesando" && ahora - new Date(x.empezado_at ?? 0).getTime() > ATASCADO_MS)) {
      await cambiar(sb, p.id, (x) => ({ ...x, estado: "pendiente", variantes: [] }));
    }
    for (;;) {
      const { pedidos: lista } = await leer(sb);
      const siguiente = lista.filter((x) => x.estado === "pendiente").sort((a, b) => String(a.at).localeCompare(String(b.at)))[0];
      if (!siguiente) break;
      await procesar(sb, siguiente);
    }
  } catch (e) {
    console.error("[trial-reels] error inesperado:", e.message);
  } finally {
    ocupado = false;
  }
}

async function procesar(sb, pedido) {
  const en = await cambiar(sb, pedido.id, (x) => ({ ...x, estado: "procesando", empezado_at: new Date().toISOString(), error: null, variantes: [] }));
  if (!en) return;
  const dir = path.join(config.tmpDir, "trial-reels");
  const fuente = path.join(dir, `${pedido.id}-fuente.mp4`);
  const locales = [];
  try {
    const { data: viral } = await sb.from("virales_propios").select("id, codigo, video_key, cuenta_id").eq("id", pedido.viral_id).maybeSingle();
    if (!viral?.video_key) throw new Error("Ese viral ya no existe o no tiene el vídeo guardado.");
    if (!(await existeEnR2(viral.video_key))) throw new Error("El vídeo original no está en el almacén.");
    const { data: cuenta } = await sb.from("cuentas_instagram").select("username").eq("id", viral.cuenta_id).maybeSingle();
    const usuario = String(cuenta?.username ?? "cuenta").replace(/^@/, "").replace(/[^a-z0-9._-]/gi, "_");
    await downloadFromR2(viral.video_key, fuente);

    // Cuantas versiones se piden (1 a 3). Si son menos de 3, los lados de zoom/filtros se eligen al azar para que no salga siempre el mismo
    const cantidad = Math.min(VARIANTES_TRIAL, Math.max(1, Number(pedido.cantidad) || VARIANTES_TRIAL));
    const estilos = [1, 2, 3].sort(() => Math.random() - 0.5).slice(0, cantidad);
    if (cantidad === VARIANTES_TRIAL) estilos.sort();
    for (let n = 1; n <= cantidad; n++) {
      const salida = path.join(dir, `${pedido.id}-v${n}.mp4`);
      locales.push(salida);
      const params = paramsTrial(estilos[n - 1]);
      const info = await spoofearTrial(fuente, salida, params);
      const key = `trial-reels/${usuario}/${viral.codigo}-${String(pedido.id).slice(0, 8)}-v${n}.mp4`;
      await uploadToR2(salida, key, "video/mp4");
      await cambiar(sb, pedido.id, (x) => ({
        ...x,
        variantes: [...(x.variantes ?? []).filter((v) => v.n !== n), { n, key, resumen: resumenTrial(params), duracion: info.duracion }],
      }));
      console.log(`[trial-reels] ${usuario}/${viral.codigo}: versión ${n}/${cantidad} lista`);
    }
    await cambiar(sb, pedido.id, (x) => ({ ...x, estado: "listo", terminado_at: new Date().toISOString() }));
  } catch (e) {
    console.error(`[trial-reels] pedido ${pedido.id}: ${e.message}`);
    await cambiar(sb, pedido.id, (x) => ({ ...x, estado: "error", error: String(e.message).slice(0, 300) }));
  } finally {
    await rm(fuente, { force: true }).catch(() => undefined);
    for (const l of locales) await rm(l, { force: true }).catch(() => undefined);
  }
}
