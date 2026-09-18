/**
 * Trial reels automaticos.
 * Para cada cuenta de Instagram activa de una modelo:
 *   1. lee sus reels y se queda con los virales (vistas > mediana x TRIAL_FACTOR),
 *   2. cada viral se puede reutilizar como maximo TRIAL_MAX_USOS (5) veces: cada uso pasa por el
 *      spoofer (recorte de 1 s al inicio y al final, zoom, brillo/contraste/saturacion, filtro),
 *   3. deja en cola TRIAL_COLCHON trial reels listos (3 al dia por cuenta => 3 dias de colchon).
 * Cada trial es una fila de library_content con origen='sistema', tipo=5 (trial), estado='aprobado'
 * y sin fecha: el panel los programa en Publer en los huecos de trial (09:00, 14:00, 19:00).
 * shortcode_ig guarda el codigo del reel de origen (asi se cuentan los usos).
 */
import { rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { descargarUrl } from "./descarga.mjs";
import { downloadFromR2, existeEnR2, publicUrl, uploadToR2 } from "./r2.mjs";
import { reelsDeCuenta } from "./instagram.mjs";
import { mediana } from "./scraper.mjs";
import { spoofear } from "./spoofer.mjs";

export const TIPO_TRIAL = 5;

/** Virales de la propia cuenta: vistas por encima de mediana x factor. */
export function viralesPropios(reels, factor = config.trialFactor) {
  const validos = reels.filter((r) => r.codigo && r.vistas > 0 && r.esVideo);
  const umbral = Math.round(mediana(validos.map((r) => r.vistas)) * factor);
  return { umbral, virales: validos.filter((r) => r.vistas > umbral) };
}

/** Siguiente origen a usar: el menos usado; a igualdad, el mas visto. Nunca pasa de maxUsos. */
export function elegirOrigen(virales, usos, maxUsos = config.trialMaxUsos) {
  return (
    virales
      .filter((v) => (usos[v.codigo] ?? 0) < maxUsos)
      .sort((a, b) => (usos[a.codigo] ?? 0) - (usos[b.codigo] ?? 0) || b.vistas - a.vistas)[0] ?? null
  );
}

async function contarPendientes(supabase, cuentaId) {
  const { count } = await supabase
    .from("library_content")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", cuentaId)
    .eq("tipo", TIPO_TRIAL)
    .eq("estado", "aprobado");
  return count ?? 0;
}

async function usosPorCodigo(supabase, cuentaId, codigos) {
  if (!codigos.length) return {};
  const { data } = await supabase
    .from("library_content")
    .select("shortcode_ig")
    .eq("cuenta_id", cuentaId)
    .eq("tipo", TIPO_TRIAL)
    .in("shortcode_ig", codigos);
  const usos = {};
  for (const r of data ?? []) usos[r.shortcode_ig] = (usos[r.shortcode_ig] ?? 0) + 1;
  return usos;
}

/** Fuente original en R2 (se descarga una sola vez y se reutiliza en los 5 usos). */
async function asegurarFuente(username, reel, destino) {
  const key = `trial/fuentes/${username}/${reel.codigo}.mp4`;
  if (await existeEnR2(key)) {
    await downloadFromR2(key, destino);
    return key;
  }
  if (!reel.videoUrl) throw new Error("el reel no trae URL de video");
  await descargarUrl(reel.videoUrl, destino);
  await uploadToR2(destino, key, "video/mp4");
  return key;
}

/**
 * Crea hasta `faltan` trial reels para una cuenta. `reels` viene ya leido de Instagram.
 * Devuelve cuantos ha creado.
 */
export async function generarTrialsCuenta(supabase, cuenta, reels, faltan) {
  const username = cuenta.username.replace(/^@/, "");
  const { virales, umbral } = viralesPropios(reels);
  if (!virales.length) {
    console.log(`[trials] @${username}: sin reels virales (umbral ${umbral} vistas)`);
    return 0;
  }
  const usos = await usosPorCodigo(supabase, cuenta.id, virales.map((v) => v.codigo));
  const dir = path.join(config.tmpDir, "trials");
  let creados = 0;

  while (creados < faltan) {
    const origen = elegirOrigen(virales, usos);
    if (!origen) {
      console.log(`[trials] @${username}: todos los virales han llegado a ${config.trialMaxUsos} usos`);
      break;
    }
    const n = (usos[origen.codigo] ?? 0) + 1;
    const fuenteLocal = path.join(dir, `${username}-${origen.codigo}-src.mp4`);
    const salidaLocal = path.join(dir, `${username}-${origen.codigo}-${n}.mp4`);
    try {
      const fuenteKey = await asegurarFuente(username, origen, fuenteLocal);
      const params = await spoofear(fuenteLocal, salidaLocal);
      const outKey = `trial/procesados/${username}/${origen.codigo}-${n}.mp4`;
      await uploadToR2(salidaLocal, outKey, "video/mp4");
      const ahora = new Date().toISOString();
      const { error } = await supabase.from("library_content").insert({
        modelo_id: cuenta.modelo_id,
        cuenta_id: cuenta.id,
        origen: "sistema",
        r2_bucket: config.r2Bucket,
        r2_key: fuenteKey,
        filename_original: `${origen.codigo}.mp4`,
        mimetype: "video/mp4",
        titulo: `Trial @${username} ${origen.codigo} (uso ${n}/${config.trialMaxUsos})`,
        shortcode_ig: origen.codigo,
        tipo: TIPO_TRIAL,
        estado: "aprobado",
        estado_procesamiento: "listo",
        video_procesado_url: publicUrl(outKey),
        caption: origen.descripcion ? String(origen.descripcion).slice(0, 2000) : "",
        notas_editor: `Spoofer: ${JSON.stringify(params)}`,
        recibido_at: ahora,
        aprobado_at: ahora,
        procesado_en: ahora,
      });
      if (error) throw new Error(error.message);
      usos[origen.codigo] = n;
      creados++;
      console.log(`[trials] @${username}: trial ${origen.codigo} uso ${n}/${config.trialMaxUsos} -> ${outKey}`);
    } catch (err) {
      console.error(`[trials] @${username}/${origen.codigo}: ${err.message}`);
      usos[origen.codigo] = config.trialMaxUsos; // no insistir con este origen en esta vuelta
    } finally {
      await rm(fuenteLocal, { force: true });
      await rm(salidaLocal, { force: true });
    }
  }
  return creados;
}

const ultimaLectura = new Map(); // cuentaId -> ms
let corriendo = false;

/** Un ciclo: repone los trial reels de cada cuenta que se quede por debajo del colchon. */
export async function cicloTrials(supabase) {
  if (corriendo) return;
  corriendo = true;
  try {
    const { data: cuentas } = await supabase
      .from("cuentas_instagram")
      .select("id, username, modelo_id, modelos(activa)")
      .eq("activa", true);
    for (const cuenta of cuentas ?? []) {
      if (cuenta.modelos && cuenta.modelos.activa === false) continue;
      const faltan = config.trialColchon - (await contarPendientes(supabase, cuenta.id));
      if (faltan <= 0) continue;
      if (Date.now() - (ultimaLectura.get(cuenta.id) ?? 0) < config.trialHoras * 3600000) continue;
      ultimaLectura.set(cuenta.id, Date.now());
      try {
        const reels = await reelsDeCuenta(cuenta.username, config.scraperMaxReels);
        await generarTrialsCuenta(supabase, cuenta, reels, faltan);
      } catch (err) {
        console.error(`[trials] @${cuenta.username}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("[trials] error inesperado:", err.message);
  } finally {
    corriendo = false;
  }
}
