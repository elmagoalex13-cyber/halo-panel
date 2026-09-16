/**
 * HALO MODELS — Runner de edición para Ionos
 * ==========================================
 * Proceso PM2 que corre indefinidamente, polling Supabase cada POLL_INTERVAL_MS.
 *
 * Ciclo principal:
 * 1. Busca piezas en library_content con estado = 'editando'
 * 2. Para cada pieza: descarga bruto de R2, procesa (tipo 1/2/3/4), sube editado a R2
 * 3. Actualiza estado a 'en_aprobacion' en Supabase
 * 4. Notifica al admin por Telegram
 * 5. También busca trial_reels con estado = 'pendiente_spoofer' y ejecuta el spoofer
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { procesarTipo1, procesarTipo2, procesarTipo3, procesarTipo4 } from "./tipos.mjs";
import { procesarTrialsPendientes } from "./spoofer.mjs";
import { notificarPiezaLista, notificarError, sendTelegram } from "./telegram.mjs";

// ─── Configuración ────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "60000", 10);
const MAX_INTENTOS = parseInt(process.env.MAX_INTENTOS ?? "3", 10);
const MAX_PIEZAS_POR_VUELTA = parseInt(process.env.MAX_PIEZAS_POR_VUELTA ?? "3", 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID) {
  console.error("❌ Faltan variables de Cloudflare R2 en .env");
  process.exit(1);
}

// ─── Cliente Supabase ─────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Ciclo principal ──────────────────────────────────────────────────────────
async function procesarPiezasPendientes() {
  const { data: piezas, error } = await supabase
    .from("library_content")
    .select(`
      id, titulo, tipo_video, r2_key, r2_key_referencia,
      frase_quemada, correcciones, intentos_edicion,
      tiene_locucion,
      modelo:modelos(nombre)
    `)
    .eq("estado", "editando")
    .order("recibido_at", { ascending: true })
    .limit(MAX_PIEZAS_POR_VUELTA);

  if (error) {
    console.error("[runner] Error al consultar Supabase:", error.message);
    return;
  }

  if (!piezas || piezas.length === 0) return;

  console.log(`[runner] ${piezas.length} pieza(s) pendiente(s) de edición`);

  for (const pieza of piezas) {
    await procesarPieza(pieza);
  }
}

async function procesarPieza(pieza) {
  const intentos = pieza.intentos_edicion ?? 0;
  if (intentos >= MAX_INTENTOS) {
    console.warn(`[runner] Pieza ${pieza.id} alcanzó MAX_INTENTOS — marcando como error`);
    await supabase
      .from("library_content")
      .update({ estado: "error_edicion" })
      .eq("id", pieza.id);
    await notificarError(`Pieza ${pieza.id} (${pieza.titulo ?? "sin título"})`, new Error("Máximo de intentos alcanzado"));
    return;
  }

  // Incrementar contador de intentos antes de empezar
  await supabase
    .from("library_content")
    .update({ intentos_edicion: intentos + 1 })
    .eq("id", pieza.id);

  const tipo = pieza.tipo_video;
  const modeloNombre = pieza.modelo?.nombre ?? "—";
  console.log(`[runner] Procesando pieza ${pieza.id} — tipo: ${tipo} — modelo: ${modeloNombre}`);

  try {
    switch (tipo) {
      case "tipo1":
        await procesarTipo1(pieza, supabase);
        break;
      case "tipo2":
        await procesarTipo2(pieza, supabase);
        break;
      case "tipo3":
        await procesarTipo3(pieza, supabase);
        break;
      case "tipo4":
        await procesarTipo4(pieza, supabase);
        break;
      default:
        console.warn(`[runner] Tipo de vídeo desconocido: ${tipo} — pieza ${pieza.id}`);
        await supabase
          .from("library_content")
          .update({ estado: "error_edicion" })
          .eq("id", pieza.id);
        return;
    }

    console.log(`[runner] ✅ Pieza ${pieza.id} procesada correctamente`);
    await notificarPiezaLista({
      titulo: pieza.titulo ?? "Sin título",
      tipo,
      modelo: modeloNombre,
    });
  } catch (err) {
    console.error(`[runner] Error procesando pieza ${pieza.id}:`, err.message);

    // Si quedan más intentos, dejar en 'editando' para reintentar en el próximo ciclo
    if (intentos + 1 < MAX_INTENTOS) {
      console.log(`[runner] Se reintentará en el próximo ciclo (intento ${intentos + 1}/${MAX_INTENTOS})`);
    } else {
      await supabase
        .from("library_content")
        .update({ estado: "error_edicion" })
        .eq("id", pieza.id);
      await notificarError(`Pieza ${pieza.id} (${pieza.titulo ?? "sin título"})`, err);
    }
  }
}

// ─── Loop principal ───────────────────────────────────────────────────────────
async function ciclo() {
  try {
    await procesarPiezasPendientes();
    await procesarTrialsPendientes(supabase);
  } catch (err) {
    console.error("[runner] Error inesperado en el ciclo:", err.message);
    await notificarError("Ciclo principal del runner", err);
  }
}

async function main() {
  console.log("🎬 HALO Runner iniciado");
  console.log(`   Polling cada ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`   Máximo ${MAX_PIEZAS_POR_VUELTA} piezas por vuelta`);
  console.log(`   Máximo ${MAX_INTENTOS} intentos por pieza`);
  console.log(`   Supabase: ${SUPABASE_URL}`);

  await sendTelegram("🟢 *HALO Runner iniciado* — el sistema de edición está activo.");

  // Primer ciclo inmediato
  await ciclo();

  // Ciclos periódicos
  setInterval(ciclo, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("❌ Error fatal en el runner:", err);
  process.exit(1);
});
