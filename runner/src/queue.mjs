import { createClient } from "@supabase/supabase-js";
import { config } from "./config.mjs";
import { publicUrl } from "./r2.mjs";
import { procesarTipo } from "./tipos.mjs";
import { asignarFrase } from "./frases.mjs";

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });

function tipoNumero(pieza) {
  if (Number.isInteger(pieza.tipo) && pieza.tipo >= 1 && pieza.tipo <= 4) return pieza.tipo;
  const m = String(pieza.tipo_video ?? "").match(/[1-4]/);
  return m ? Number(m[0]) : 1;
}

export async function liberarAtascadas() {
  // Piezas que quedaron en 'procesando' (crash/reinicio) vuelven a la cola.
  const limite = new Date(Date.now() - config.stuckMinutes * 60000).toISOString();
  const { data, error } = await supabase
    .from("library_content")
    .update({ estado_procesamiento: "pendiente" })
    .eq("estado", "editando")
    .eq("estado_procesamiento", "procesando")
    .lt("updated_at", limite)
    .select("id");

  if (error) {
    console.error("[runner] no se pudieron liberar piezas atascadas:", error.message);
  } else if (data?.length) {
    console.log(`[runner] ${data.length} pieza(s) atascada(s) reencolada(s)`);
  }
}

async function reclamar(id) {
  const { data, error } = await supabase
    .from("library_content")
    .update({ estado_procesamiento: "procesando", error_mensaje: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado_procesamiento", "pendiente")
    .select("id");
  if (error) console.error(`[runner] no se pudo reclamar ${id}:`, error.message);
  return (data?.length ?? 0) > 0;
}

function withTimeout(promise, ms, label) {
  let timer;
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 18 * 60000;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} supero el limite de ${Math.round(safeMs / 60000)} min`)), safeMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function procesarPieza(pieza) {
  const tipo = tipoNumero(pieza);
  // Mientras se edita, se renueva updated_at cada minuto: asi nunca se la da por atascada (ni la coge otra maquina) aunque tarde
  const latido = setInterval(() => {
    supabase.from("library_content").update({ updated_at: new Date().toISOString() }).eq("id", pieza.id).eq("estado_procesamiento", "procesando").then(() => undefined, () => undefined);
  }, 60000);
  console.log(`[runner] pieza ${pieza.id} tipo ${tipo}`);
  try {
    if (tipo === 2 && !pieza.frase_quemada) {
      const asignado = await asignarFrase(supabase, pieza);
      pieza.frase_quemada = asignado?.frase ?? "";
      pieza.layout_json = asignado?.layout_json ?? null;
    }
    const { outKey, rawKey, fraseQuemada, trimUsado, trimManual } = await withTimeout(
      procesarTipo(tipo, pieza),
      config.pieceTimeoutMs,
      `pieza ${pieza.id}`,
    );
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("library_content")
      .update({
        estado: "en_aprobacion",
        estado_procesamiento: "listo",
        video_procesado_url: publicUrl(outKey),
        r2_key_original: pieza.r2_key_original ?? rawKey,
        frase_quemada: fraseQuemada,
        // Se guarda el recorte REALMENTE usado (automatico o manual) para que
        // la mesa de aprobacion siempre muestre el corte actual y una nota de
        // "rehacer" con ajuste (ej. "inicio +1.5") tenga un valor del que partir.
        ...(trimUsado ? { recorte_inicio: trimUsado.start ?? null, recorte_fin: trimUsado.end ?? null } : {}),
        // Si esta vez el recorte fue automatico, se quita la marca de recorte manual de la edicion anterior
        ...(trimUsado && !trimManual && /\[recorte-manual\]/.test(pieza.notas_editor ?? "")
          ? { notas_editor: (pieza.notas_editor ?? "").replace(/\[recorte-manual\]/g, "").trim() || null }
          : {}),
        error_mensaje: null,
        procesado_en: ahora,
        edicion_at: ahora,
        updated_at: ahora,
      })
      .eq("id", pieza.id);
    if (error) throw new Error(`Supabase: ${error.message}`);
    console.log(`[runner] OK ${pieza.id} -> ${outKey}`);
    return { ok: true, id: pieza.id };
  } catch (err) {
    console.error(`[runner] ERROR ${pieza.id}:`, err.message);
    await supabase
      .from("library_content")
      .update({ estado_procesamiento: "error", error_mensaje: String(err.message).slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", pieza.id);
    return { ok: false, id: pieza.id, error: err.message };
  } finally {
    clearInterval(latido);
  }
}

async function runPool(items, concurrency, task) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) results.push(await task(item));
    }
  });
  await Promise.all(workers);
  return results;
}

const COLUMNAS_COLA = "id, modelo_id, cuenta_id, tipo, tipo_video, r2_key, r2_key_original, r2_key_referencia, audio_referencia_url, frase_quemada, layout_json, recorte_inicio, recorte_fin, notas_editor";

/**
 * Reparto justo: si una modelo sube 60 videos de golpe, las demas no esperan a que acabe. Se toma el 1.º de cada modelo, luego el 2.º
 * de cada una, etc. (dentro de cada modelo, por orden de llegada; entre modelos, gana la que lleva mas esperando).
 */
export function entrelazar(piezas) {
  const colas = new Map();
  for (const p of piezas) {
    const k = p.modelo_id ?? "_";
    if (!colas.has(k)) colas.set(k, []);
    colas.get(k).push(p);
  }
  const listas = [...colas.values()];
  const salida = [];
  for (let i = 0; salida.length < piezas.length; i++) for (const l of listas) if (l[i]) salida.push(l[i]);
  return salida;
}

async function candidatas() {
  const { data, error } = await supabase
    .from("library_content")
    .select(COLUMNAS_COLA)
    .eq("estado", "editando")
    .eq("estado_procesamiento", "pendiente")
    .order("recibido_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[runner] error consultando la cola:", error.message);
    return [];
  }
  return entrelazar(data ?? []);
}

/** Reclama (de forma atomica: varios trabajadores o maquinas no se pisan) la siguiente pieza que toque. */
export async function tomarSiguiente() {
  for (const pieza of await candidatas()) if (await reclamar(pieza.id)) return pieza;
  return null;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let ultimaLiberacion = 0;

async function trabajador(num) {
  await dormir(num * 1500);
  for (;;) {
    try {
      if (Date.now() - ultimaLiberacion > 60000) {
        ultimaLiberacion = Date.now();
        await liberarAtascadas();
      }
      const pieza = await tomarSiguiente();
      if (!pieza) {
        await dormir(config.pollMs);
        continue;
      }
      console.log(`[runner#${num}] procesando ${pieza.id}`);
      await procesarPieza(pieza);
    } catch (err) {
      console.error(`[runner#${num}] error inesperado:`, err.message);
      await dormir(config.pollMs);
    }
  }
}

/** Arranca N trabajadores que van cogiendo piezas sin parar (en cuanto uno acaba coge la siguiente, sin esperar a los demas). */
export function iniciarTrabajadores(n = config.runnerConcurrency) {
  for (let i = 1; i <= n; i++) void trabajador(i);
}

export async function cicloOnce({ logEmpty = false } = {}) {
  await liberarAtascadas();
  const piezas = (await candidatas()).slice(0, config.maxPiezas);

  if (!piezas?.length) {
    if (logEmpty) console.log("[runner] no hay piezas pendientes para procesar");
    return { claimed: 0, results: [] };
  }

  const reclamadas = [];
  for (const pieza of piezas) {
    if (await reclamar(pieza.id)) reclamadas.push(pieza);
  }

  if (!reclamadas.length) {
    if (logEmpty) console.log("[runner] habia pendientes, pero ninguna pudo reclamarse");
    return { claimed: 0, results: [] };
  }

  const concurrency = Math.min(config.runnerConcurrency, Math.max(1, config.maxPiezas));
  console.log(`[runner] procesando ${reclamadas.length} pieza(s), concurrencia ${concurrency}`);
  const results = await runPool(reclamadas, concurrency, procesarPieza);
  return { claimed: reclamadas.length, results };
}
