/**
 * Scraper de referencias virales.
 * Para cada cuenta activa de referencias (referencias_cuentas, espejada en cuentas_referencia):
 *   1. pide a Apify los ultimos reels de la cuenta,
 *   2. calcula la mediana de vistas y el umbral viral (mediana x factor, 1.5 por defecto),
 *   3. de los reels que superan el umbral, descarga el video y la miniatura a R2
 *      (referencias/<cuenta>/<codigo>.mp4|jpg) y los guarda en referencias_videos
 *      (estado_triaje='pendiente') para que se revisen en el panel (Instagram > Ideas virales),
 *   4. actualiza las estadisticas de la cuenta (mediana, umbral, procesados, extraidos).
 * Sin Telegram. Necesita APIFY_TOKEN en el .env del runner.
 */
import { mkdir, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { config } from "./config.mjs";
import { publicUrl, uploadToR2 } from "./r2.mjs";

export function mediana(valores) {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : Math.round((orden[mitad - 1] + orden[mitad]) / 2);
}

/** Normaliza un item de Apify (los actores nombran los campos distinto). */
export function normalizarItem(it) {
  const codigo = it.shortCode ?? it.shortcode ?? it.code ?? String(it.url ?? "").match(/\/(?:reel|p)\/([^/?]+)/)?.[1] ?? null;
  const vistas = Number(it.videoPlayCount ?? it.playsCount ?? it.videoViewCount ?? it.viewsCount ?? it.views ?? 0) || 0;
  return {
    codigo,
    vistas,
    likes: Math.max(0, Number(it.likesCount ?? it.likes ?? 0) || 0),
    videoUrl: it.videoUrl ?? it.video_url ?? null,
    miniatura: it.displayUrl ?? it.thumbnailUrl ?? it.thumbnail ?? null,
    descripcion: it.caption ?? it.text ?? null,
    fecha: it.timestamp ?? it.takenAt ?? null,
    esVideo: Boolean(it.videoUrl ?? it.video_url) || String(it.type ?? "").toLowerCase() === "video",
  };
}

/** Devuelve { mediana, umbral, virales } de una lista de reels ya normalizados. */
export function analizar(reels, factor = config.scraperFactor) {
  const validos = reels.filter((r) => r.codigo && r.vistas > 0);
  const med = mediana(validos.map((r) => r.vistas));
  const umbral = Math.round(med * factor);
  const virales = validos.filter((r) => r.vistas > umbral && r.esVideo && r.videoUrl).sort((a, b) => b.vistas - a.vistas);
  return { mediana: med, umbral, analizados: validos.length, virales };
}

async function pedirReels(username) {
  if (!config.apifyToken) throw new Error("Falta APIFY_TOKEN en el .env del runner");
  const url = `https://api.apify.com/v2/acts/${config.scraperActor}/run-sync-get-dataset-items?token=${config.apifyToken}&timeout=240`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: [username], resultsLimit: config.scraperMaxReels }),
    signal: AbortSignal.timeout(280000),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("Respuesta inesperada de Apify");
  return items.map(normalizarItem);
}

async function descargar(url, destino) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok || !res.body) throw new Error(`Descarga ${res.status}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
}

async function subirReel(username, reel) {
  const base = `referencias/${username}/${reel.codigo}`;
  const dir = path.join(config.tmpDir, "scraper");
  const mp4 = path.join(dir, `${reel.codigo}.mp4`);
  let thumbUrl = null;
  try {
    await descargar(reel.videoUrl, mp4);
    await uploadToR2(mp4, `${base}.mp4`, "video/mp4");
    if (reel.miniatura) {
      const jpg = path.join(dir, `${reel.codigo}.jpg`);
      try {
        await descargar(reel.miniatura, jpg);
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
 * Analiza una cuenta. `reels` se puede inyectar (pruebas); si no, se piden a Apify.
 * Devuelve un resumen { username, analizados, mediana, umbral, nuevos }.
 */
export async function analizarCuenta(supabase, cuenta, reelsInyectados = null) {
  const username = cuenta.username.replace(/^@/, "");
  const reels = reelsInyectados ?? (await pedirReels(username));
  const { mediana: med, umbral, analizados, virales } = analizar(reels);

  const { data: existentes } = await supabase.from("referencias_videos").select("video_url").eq("cuenta_id", cuenta.id);
  const yaGuardados = new Set((existentes ?? []).map((v) => String(v.video_url ?? "").match(/([^/]+)\.mp4$/)?.[1]).filter(Boolean));

  let nuevos = 0;
  for (const reel of virales) {
    if (yaGuardados.has(reel.codigo)) continue;
    try {
      const { videoKey, thumbUrl } = await subirReel(username, reel);
      const { error } = await supabase.from("referencias_videos").insert({
        cuenta_id: cuenta.id,
        video_url: videoKey,
        thumbnail_url: thumbUrl,
        descripcion: reel.descripcion ? String(reel.descripcion).slice(0, 1000) : null,
        visitas: reel.vistas,
        likes: reel.likes,
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
  const { data: a } = await supabase.from("referencias_cuentas").select("id, username, ultimo_scrape_at, activa").eq("activa", true);
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
  if (corriendo || !config.apifyToken) return;
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
