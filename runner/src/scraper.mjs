/**
 * Scraper propio de referencias virales (sin Apify).
 * Para cada cuenta activa de referencias (referencias_cuentas, espejada en cuentas_referencia):
 *   1. lee los ultimos reels de la cuenta directamente de Instagram (instagram.mjs, cookie IG_SESSIONID),
 *   2. calcula la mediana de vistas y el umbral viral (mediana x factor, 1.5 por defecto),
 *   3. de los reels de los ultimos SCRAPER_DIAS dias que superan el umbral, descarga el video y la
 *      miniatura a R2 (referencias/<cuenta>/<codigo>.mp4|jpg) y los guarda en referencias_videos
 *      (estado_triaje='pendiente') con sus metricas (vistas, likes, comentarios, compartidos),
 *   4. actualiza las estadisticas de la cuenta (mediana, umbral, procesados, extraidos).
 * Sin Telegram. Necesita IG_SESSIONID en el .env del runner.
 */
import { rm } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { descargarUrl } from "./descarga.mjs";
import { publicUrl, uploadToR2 } from "./r2.mjs";
import { reelsDeCuenta } from "./instagram.mjs";

export function mediana(valores) {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : Math.round((orden[mitad - 1] + orden[mitad]) / 2);
}

/** Devuelve { mediana, umbral, virales } de una lista de reels ya normalizados. */
export function analizar(reels, factor = config.scraperFactor) {
  const validos = reels.filter((r) => r.codigo && r.vistas > 0);
  const med = mediana(validos.map((r) => r.vistas));
  const umbral = Math.round(med * factor);
  const desde = Date.now() - config.scraperDias * 86400000;
  const virales = validos
    .filter((r) => r.vistas > umbral && r.esVideo && r.videoUrl && (!r.fecha || new Date(r.fecha).getTime() >= desde))
    .sort((a, b) => b.vistas - a.vistas);
  return { mediana: med, umbral, analizados: validos.length, virales };
}

/** Metricas extra que la tabla no tiene como columna: se guardan en tags como "m:clave=valor". */
export function tagsMetricas(reel) {
  const tags = [`m:codigo=${reel.codigo}`, `m:comentarios=${reel.comentarios ?? 0}`, `m:compartidos=${reel.compartidos ?? 0}`];
  if (reel.audio?.titulo) tags.push(`meta:cancion=${limpiarTag(reel.audio.titulo)}`);
  if (reel.audio?.artista) tags.push(`meta:artista=${limpiarTag(reel.audio.artista)}`);
  if (reel.audio?.id) tags.push(`meta:audio_id=${limpiarTag(reel.audio.id)}`);
  return tags;
}

function limpiarTag(value) {
  return String(value).replace(/\s+/g, " ").replace(/[|\n\r]/g, " ").trim().slice(0, 120);
}

function categoriaDeCuenta(cuenta) {
  return String(cuenta.categoria ?? "").trim().toLowerCase();
}

function fraseDesdeDescripcion(descripcion) {
  const texto = String(descripcion ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  const quoted = texto.match(/[“"']([^“"']{8,140})[”"']/)?.[1];
  if (quoted) return quoted.trim();
  const primeraLinea = texto.split(/[.!?]\s/)[0]?.trim();
  return primeraLinea && primeraLinea.length >= 8 && primeraLinea.length <= 140 ? primeraLinea : null;
}

async function subirReel(username, reel) {
  const base = `referencias/${username}/${reel.codigo}`;
  const dir = path.join(config.tmpDir, "scraper");
  const mp4 = path.join(dir, `${reel.codigo}.mp4`);
  let thumbUrl = null;
  try {
    await descargarUrl(reel.videoUrl, mp4);
    await uploadToR2(mp4, `${base}.mp4`, "video/mp4");
    if (reel.miniatura) {
      const jpg = path.join(dir, `${reel.codigo}.jpg`);
      try {
        await descargarUrl(reel.miniatura, jpg);
        await uploadToR2(jpg, `${base}.jpg`, "image/jpeg");
        thumbUrl = publicUrl(`${base}.jpg`);
      } catch {
        thumbUrl = null;
      } finally {
        await rm(jpg, { force: true });
      }
    }
  } finally {
    await rm(mp4, { force: true });
  }
  return { videoKey: `${base}.mp4`, thumbUrl };
}

/**
 * Analiza una cuenta. `reels` se puede inyectar (pruebas); si no, se leen de Instagram.
 * Devuelve un resumen { username, analizados, mediana, umbral, nuevos }.
 */
export async function analizarCuenta(supabase, cuenta, reelsInyectados = null) {
  const username = cuenta.username.replace(/^@/, "");
  const categoria = categoriaDeCuenta(cuenta);
  const reels = reelsInyectados ?? (await reelsDeCuenta(username, config.scraperMaxReels));
  const { mediana: med, umbral, analizados, virales } = analizar(reels);

  const { data: existentes } = await supabase.from("referencias_videos").select("video_url").eq("cuenta_id", cuenta.id);
  const yaGuardados = new Set((existentes ?? []).map((v) => String(v.video_url ?? "").match(/([^/]+)\.mp4$/)?.[1]).filter(Boolean));

  let nuevos = 0;
  for (const reel of virales) {
    if (yaGuardados.has(reel.codigo)) continue;
    try {
      const { videoKey, thumbUrl } = await subirReel(username, reel);
      const tags = [`meta:categoria=${categoria || "general"}`, ...tagsMetricas(reel)];
      const frase = categoria === "frases" ? fraseDesdeDescripcion(reel.descripcion) : null;
      const { error } = await supabase.from("referencias_videos").insert({
        cuenta_id: cuenta.id,
        video_url: videoKey,
        thumbnail_url: thumbUrl,
        descripcion: reel.descripcion ? String(reel.descripcion).slice(0, 1000) : null,
        visitas: reel.vistas,
        likes: reel.likes,
        tags,
        frase_detectada: frase,
        formato_propuesto: categoria === "frases" ? "tipo2" : null,
        formato_confirmado: categoria === "frases" ? "tipo2" : null,
        fecha_publicacion: reel.fecha ? new Date(reel.fecha).toISOString() : null,
        estado_triaje: "pendiente",
      });
      if (error) throw new Error(error.message);
      nuevos++;
    } catch (err) {
      console.error(`[scraper] @${username}/${reel.codigo}: ${err.message}`);
    }
  }

  await guardarEstadisticas(supabase, cuenta, { mediana: med, umbral, analizados, nuevos });
  return { username, analizados, mediana: med, umbral, virales: virales.length, nuevos };
}

/** Actualiza referencias_cuentas.ultimo_scrape_at y la ficha de estadisticas en cuentas_referencia. */
async function guardarEstadisticas(supabase, cuenta, { mediana: med, umbral, analizados, nuevos }) {
  const ahora = new Date().toISOString();
  await supabase.from("referencias_cuentas").update({ ultimo_scrape_at: ahora }).eq("id", cuenta.id);

  const { data: fila } = await supabase
    .from("cuentas_referencia")
    .select("id, total_procesados, total_extraidos")
    .eq("username", cuenta.username)
    .maybeSingle();
  const stats = {
    ultimo_analisis: ahora,
    mediana_vistas: med,
    umbral_viral: umbral,
    total_procesados: (fila?.total_procesados ?? 0) + analizados,
    total_extraidos: (fila?.total_extraidos ?? 0) + nuevos,
    updated_at: ahora,
  };
  if (fila) await supabase.from("cuentas_referencia").update(stats).eq("id", fila.id);
  else await supabase.from("cuentas_referencia").insert({ username: cuenta.username, activa: true, ...stats });
}

/** Cuentas activas (referencias_cuentas). Las que solo existen en cuentas_referencia se crean aqui. */
export async function cuentasActivas(supabase) {
  const { data: a } = await supabase.from("referencias_cuentas").select("id, username, categoria, ultimo_scrape_at, activa").eq("activa", true);
  const lista = a ?? [];
  const { data: b } = await supabase.from("cuentas_referencia").select("username").eq("activa", true);
  for (const extra of b ?? []) {
    if (lista.some((c) => c.username.toLowerCase() === extra.username.toLowerCase())) continue;
    const { data: nueva } = await supabase
      .from("referencias_cuentas")
      .insert({ username: extra.username, activa: true })
      .select("id, username, ultimo_scrape_at, activa")
      .single();
    if (nueva) lista.push(nueva);
  }
  return lista;
}

// log_agentes solo admite agente 'runner_edicion'/'venuz_sync' y resultado 'ok'/'error'
async function registrar(supabase, resultado, detalle, entidadId = null) {
  await supabase
    .from("log_agentes")
    .insert({ agente: "runner_edicion", accion: "scraper_referencias", resultado, detalle, entidad_tipo: "cuenta_referencia", entidad_id: entidadId })
    .then(() => undefined, () => undefined);
}

let corriendo = false;

/**
 * Un ciclo del scraper: analiza las cuentas activas cuyo ultimo analisis es mas viejo que
 * SCRAPER_HORAS (24 por defecto) o que nunca se han analizado. Para forzar una cuenta desde el
 * panel basta con poner referencias_cuentas.ultimo_scrape_at = null.
 */
export async function cicloScraper(supabase, { forzar = false } = {}) {
  if (corriendo) return;
  corriendo = true;
  try {
    const limite = Date.now() - config.scraperHoras * 3600000;
    const cuentas = (await cuentasActivas(supabase)).filter(
      (c) => forzar || !c.ultimo_scrape_at || new Date(c.ultimo_scrape_at).getTime() < limite,
    );
    if (!cuentas.length) return;

    console.log(`[scraper] analizando ${cuentas.length} cuenta(s)`);
    for (const cuenta of cuentas) {
      try {
        const r = await analizarCuenta(supabase, cuenta);
        console.log(`[scraper] @${r.username}: ${r.analizados} reels, mediana ${r.mediana}, umbral ${r.umbral}, ${r.nuevos} nuevos virales`);
        await registrar(supabase, "ok", r, cuenta.id);
      } catch (err) {
        console.error(`[scraper] @${cuenta.username}: ${err.message}`);
        await registrar(supabase, "error", { username: cuenta.username, error: String(err.message).slice(0, 300) }, cuenta.id);
        // marcar el intento para no reintentar en bucle cada minuto
        await supabase.from("referencias_cuentas").update({ ultimo_scrape_at: new Date().toISOString() }).eq("id", cuenta.id);
      }
    }
  } catch (err) {
    console.error("[scraper] error inesperado:", err.message);
  } finally {
    corriendo = false;
  }
}
