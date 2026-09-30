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
  console.log(`[runner] pieza ${pieza.id} tipo ${tipo}`);
  try {
    if (tipo === 2 && !pieza.frase_quemada) {
      const asignado = await asignarFrase(supabase, pieza);
      pieza.frase_quemada = asignado?.frase ?? "";
      pieza.layout_json = asignado?.layout_json ?? null;
    }
    const { outKey, rawKey, fraseQuemada } = await withTimeout(
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

export async function cicloOnce({ logEmpty = false } = {}) {
  await liberarAtascadas();
  const { data: piezas, error } = await supabase
    .from("library_content")
    .select("id, modelo_id, cuenta_id, tipo, tipo_video, r2_key, r2_key_original, r2_key_referencia, audio_referencia_url, frase_quemada, layout_json, recorte_inicio, recorte_fin")
    .eq("estado", "editando")
    .eq("estado_procesamiento", "pendiente")
    .order("recibido_at", { ascending: true })
    .limit(config.maxPiezas);

  if (error) {
    console.error("[runner] error consultando la cola:", error.message);
    return { claimed: 0, results: [] };
  }

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
