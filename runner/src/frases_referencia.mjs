/**
 * Banco de frases CON MUSICA. Cada video de «frase con musica» que se aprueba/asigna (el panel lo marca con la etiqueta «meta:analizar_frase=1»)
 * se procesa aqui: el editor lee la frase y como esta colocada (OCR, igual que el scraper), saca el AUDIO del video (la cancion) y guarda las
 * dos cosas en el banco de frases (la musica en R2: frases-audio/<id_frase>.m4a). Despues, cuando se edita un video de gesto de una modelo, se le
 * pone una frase del banco —preferentemente una que tenga musica— y su cancion ya mezclada (ver queue.mjs y frases.mjs).
 *
 * Al terminar la etiqueta pasa a «meta:frase_banco=1». La lista de frases que ya tienen musica se guarda en panel_config (frases_con_audio)
 * para que el panel tambien las prefiera al asignar frase cuando la modelo sube su video.
 */
import path from "path";
import { mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "./config.mjs";
import { downloadFromR2, uploadToR2, keyDesdeUrl, existeEnR2, listarClaves } from "./r2.mjs";
import { analizarLayoutTexto, puntuarTexto } from "./vision.mjs";

const execFileAsync = promisify(execFile);
const ETIQUETA_PENDIENTE = "meta:analizar_frase=1";
const ETIQUETA_HECHO = "meta:frase_banco=1";
const ETIQUETA_FALTA = "meta:frase_falta=1"; // el OCR no ha leido bien la frase: hay que escribirla a mano
const ETIQUETA_MANUAL = "meta:frase_manual=1"; // la frase la ha escrito una persona (frase_detectada): se usa tal cual
const CALIDAD_MINIMA = 85;
const SIN_CANCION = "Sin cancion";
const PREFIJO_AUDIO = "frases-audio/";

export const claveAudioFrase = (fraseId) => `${PREFIJO_AUDIO}${fraseId}.m4a`;

const norm = (t) => String(t ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const tagValor = (tags, clave) => (tags ?? []).find((t) => t.startsWith(`${clave}=`))?.slice(clave.length + 1) ?? null;

const palabraLimpia = (w) => /^[\p{L}¿¡"“”'’(][\p{L}\p{M}.,:;!?¡¿"“”'’()…-]*$/u.test(w) || /^\d[\d.,:%-]*$/.test(w);

/** Layout con el texto de cada bloque sin los simbolos y restos que mete el OCR (asi lo que se quema en el video es lo mismo que la frase). */
export function limpiarLayout(layout) {
  if (!Array.isArray(layout?.bloques)) return layout;
  const bloques = layout.bloques
    .map((b) => ({ ...b, texto: String(b.texto ?? "").split(/\s+/).filter((w) => w && palabraLimpia(w)).join(" ") }))
    .filter((b) => b.texto.length >= 3);
  return { ...layout, bloques };
}

/** Frase de los bloques de texto que se leen en pantalla (los bloques cercanos ya vienen unidos por el OCR). */
export function fraseDeLayout(layout) {
  const bloques = Array.isArray(layout?.bloques) ? layout.bloques : [];
  // Fuera lo que el OCR mete de mas: simbolos sueltos (/ | \) y 1-2 letras sueltas tras el punto final de la frase
  const palabras = bloques.flatMap((b) => String(b.texto ?? "").split(/\s+/)).filter((w) => w && palabraLimpia(w));
  for (let cambio = true; cambio && palabras.length > 3; ) {
    const ultima = palabras.at(-1);
    const previa = palabras.at(-2);
    cambio = ultima.length <= 2 && (/[.?!]$/.test(previa) || previa.length <= 2) && !/[.?!]$/.test(ultima);
    if (cambio) palabras.pop();
  }
  const texto = palabras.join(" ").replace(/\s+/g, " ").trim();
  return texto.length >= 6 ? texto.slice(0, 300) : null;
}

/** Frase sacada de la descripcion de Instagram (solo si el video no tiene texto legible): sin hashtags, enlaces ni emojis. */
export function limpiarFrase(texto) {
  const limpio = String(texto ?? "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[\p{Extended_Pictographic}‍️]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length >= 6 && limpio.length <= 200 ? limpio : null;
}

async function frasesDelBanco(supabase) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("banco_frases_canciones").select("id, frase").order("id").range(desde, desde + 999);
    if (error) throw new Error(`banco de frases: ${error.message}`);
    filas.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return filas;
}

/** Ids de las frases que ya tienen su musica en R2. */
export async function frasesConAudio() {
  const claves = await listarClaves(PREFIJO_AUDIO).catch(() => []);
  return claves.map((k) => k.slice(PREFIJO_AUDIO.length).replace(/\.m4a$/, "")).filter(Boolean);
}

async function publicarListaConAudio(supabase) {
  const ids = await frasesConAudio();
  await supabase.from("panel_config").upsert({ key: "frases_con_audio", value: { ids }, updated_at: new Date().toISOString() });
}

/** Saca la musica del video de referencia (hasta 20 s desde el principio) y la sube a R2. Devuelve true si habia audio. */
async function subirAudioDeVideo(mp4, destino, key) {
  const m4a = path.join(destino, "musica.m4a");
  try {
    await execFileAsync(config.ffmpeg, ["-y", "-i", mp4, "-vn", "-t", "20", "-c:a", "aac", "-b:a", "160k", m4a], { maxBuffer: 1024 * 1024 * 8 });
    await uploadToR2(m4a, key, "audio/mp4");
    return true;
  } catch {
    return false; // el video no tiene audio (o no se pudo leer): la frase se guarda sin musica
  }
}

let ocupado = false;

export async function cicloFrasesReferencia(supabase) {
  if (ocupado) return;
  ocupado = true;
  try {
    const { data: videos, error } = await supabase
      .from("referencias_videos")
      .select("id, video_url, descripcion, frase_detectada, layout_json, tags")
      .eq("formato_confirmado", "tipo2")
      .contains("tags", [ETIQUETA_PENDIENTE])
      .limit(5);
    if (error || !videos?.length) return;

    for (const v of videos) {
      const dir = path.join(config.tmpDir, "frases-ref", randomUUID());
      try {
        const key = keyDesdeUrl(v.video_url);
        let layout = v.layout_json && Array.isArray(v.layout_json.bloques) && v.layout_json.bloques.length ? v.layout_json : null;
        await mkdir(dir, { recursive: true });
        const mp4 = path.join(dir, "ref.mp4");
        if (key) await downloadFromR2(key, mp4);
        if (!layout && key) layout = await analizarLayoutTexto(mp4);
        if (layout?.origen === "tesseract") layout = limpiarLayout(layout);
        // Frase: la que escribio una persona; si no, la que lee el OCR SOLO si se lee bien (si no, mejor pedirla a mano que quemar basura en un video)
        const manual = (v.tags ?? []).includes(ETIQUETA_MANUAL) ? v.frase_detectada?.trim() || null : null;
        const calidad = Array.isArray(layout?.bloques) ? puntuarTexto(layout.bloques) : -1;
        const delOcr = calidad >= CALIDAD_MINIMA ? fraseDeLayout(layout) : null;
        const frase = manual ?? delOcr;
        // La colocacion sale del OCR (posiciones); con frase escrita a mano, su texto sustituye al leido
        if (manual && layout?.bloques?.length) layout = { ...layout, bloques: [{ ...layout.bloques[0], texto: manual }] };
        else if (manual) layout = { version: 1, origen: "manual", bloques: [{ texto: manual, posicion: "center", color: "#FFFFFF", negrita: true, fontsize: 72 }] };

        let mensaje = "frase no legible (OCR con calidad baja): hay que escribirla a mano";
        if (frase) {
          // 1) La frase al banco (si no estaba ya), con su colocacion y la cancion
          const banco = await frasesDelBanco(supabase);
          let fraseId = banco.find((f) => norm(f.frase) === norm(frase))?.id ?? null;
          if (!fraseId) {
            const { data: nueva, error: eIns } = await supabase
              .from("banco_frases_canciones")
              .insert({
                frase,
                cancion_nombre: tagValor(v.tags, "meta:cancion") || SIN_CANCION,
                cancion_artista: tagValor(v.tags, "meta:artista"),
                audio_id_ig: tagValor(v.tags, "meta:audio_id"),
                puntuacion: 7,
                layout_json: layout,
                origen: "analizador", // la tabla solo admite los origenes que ya usa (manual / analizador)
                veces_usada: 0,
                activa: true,
              })
              .select("id")
              .single();
            if (eIns || !nueva) throw new Error(`no se pudo guardar la frase en el banco: ${eIns?.message ?? "sin respuesta"}`);
            fraseId = nueva.id;
            mensaje = "guardada en el banco";
          } else {
            mensaje = "ya estaba en el banco";
          }
          // 2) La musica del video, para esa frase (si aun no la tiene)
          const claveAudio = claveAudioFrase(fraseId);
          if (key && !(await existeEnR2(claveAudio))) {
            mensaje += (await subirAudioDeVideo(mp4, dir, claveAudio)) ? " + musica" : " (el video no tiene audio)";
          } else if (key) {
            mensaje += " (ya tenia musica)";
          }
        }

        // 3) Frase y colocacion tambien en el propio video de referencia, y se quita la marca de pendiente
        const base = (v.tags ?? []).filter((t) => t !== ETIQUETA_PENDIENTE && t !== ETIQUETA_FALTA && t !== ETIQUETA_MANUAL);
        const tags = [...base, frase ? ETIQUETA_HECHO : ETIQUETA_FALTA];
        await supabase.from("referencias_videos").update({ frase_detectada: frase ?? v.frase_detectada, layout_json: frase ? layout : v.layout_json, tags }).eq("id", v.id);
        await publicarListaConAudio(supabase);
        console.log(`[frases-ref] ${v.id}: ${frase ? `«${frase.slice(0, 60)}» ` : ""}${mensaje}`);
      } catch (e) {
        console.error(`[frases-ref] ${v.id}:`, e.message);
        // Si falla, se quita la marca para no reintentar para siempre
        await supabase.from("referencias_videos").update({ tags: (v.tags ?? []).filter((t) => t !== ETIQUETA_PENDIENTE) }).eq("id", v.id);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.error("[frases-ref] error inesperado:", e.message);
  } finally {
    ocupado = false;
  }
}

let ocupadoPedidos = false;

/**
 * Pedidos desde la pagina Frases: «pon a esta frase la musica de este video guardado». Se saca el audio del video y se sube como musica de la frase.
 * (La cola vive en panel_config.frases_audio_pedidos; el panel anade pedidos y aqui se quitan al hacerlos.)
 */
export async function cicloPedidosMusica(supabase) {
  if (ocupadoPedidos) return;
  ocupadoPedidos = true;
  try {
    const { data: fila } = await supabase.from("panel_config").select("value").eq("key", "frases_audio_pedidos").maybeSingle();
    const items = fila?.value?.items ?? [];
    if (!items.length) return;
    const hechos = [];
    for (const it of items.slice(0, 3)) {
      const dir = path.join(config.tmpDir, "frases-musica", randomUUID());
      try {
        const { data: v } = await supabase.from("referencias_videos").select("video_url, tags").eq("id", it.video_id).maybeSingle();
        const key = keyDesdeUrl(v?.video_url);
        if (!key) throw new Error("el video ya no existe");
        await mkdir(dir, { recursive: true });
        const mp4 = path.join(dir, "ref.mp4");
        await downloadFromR2(key, mp4);
        if (!(await subirAudioDeVideo(mp4, dir, claveAudioFrase(it.frase_id)))) throw new Error("el video no tiene audio");
        // De paso, la cancion de ese video queda apuntada en la frase si la frase no tenia ninguna
        const cancion = tagValor(v.tags, "meta:cancion");
        if (cancion) {
          const { data: f } = await supabase.from("banco_frases_canciones").select("cancion_nombre").eq("id", it.frase_id).maybeSingle();
          if (!f?.cancion_nombre || f.cancion_nombre === SIN_CANCION || f.cancion_nombre === "varios") {
            await supabase.from("banco_frases_canciones").update({ cancion_nombre: cancion, cancion_artista: tagValor(v.tags, "meta:artista"), audio_id_ig: tagValor(v.tags, "meta:audio_id") }).eq("id", it.frase_id);
          }
        }
        console.log(`[frases-musica] frase ${it.frase_id}: musica puesta desde el video ${it.video_id}`);
      } catch (e) {
        console.error(`[frases-musica] frase ${it.frase_id}:`, e.message);
      } finally {
        hechos.push(it);
        await rm(dir, { recursive: true, force: true });
      }
    }
    // Se quitan solo los hechos (el panel puede haber anadido otros mientras tanto)
    const { data: ultimo } = await supabase.from("panel_config").select("value").eq("key", "frases_audio_pedidos").maybeSingle();
    const quedan = (ultimo?.value?.items ?? []).filter((x) => !hechos.some((h) => h.frase_id === x.frase_id && h.video_id === x.video_id));
    await supabase.from("panel_config").upsert({ key: "frases_audio_pedidos", value: { items: quedan }, updated_at: new Date().toISOString() });
    await publicarListaConAudio(supabase);
  } catch (e) {
    console.error("[frases-musica] error inesperado:", e.message);
  } finally {
    ocupadoPedidos = false;
  }
}

/** Musica de la frase de esta pieza (la que se le asigno del banco), si esa frase tiene. Devuelve la clave en R2 o null. */
export async function audioDeFraseDePieza(supabase, pieza) {
  let { data, error } = await supabase.from("banco_frases_usos").select("frase_id").eq("pieza_id", pieza.id).order("created_at", { ascending: false }).limit(1);
  if (error) ({ data } = await supabase.from("banco_frases_usos").select("frase_id").eq("pieza_id", pieza.id).limit(1));
  const fraseId = data?.[0]?.frase_id;
  if (!fraseId) return null;
  const key = claveAudioFrase(fraseId);
  return (await existeEnR2(key)) ? key : null;
}
