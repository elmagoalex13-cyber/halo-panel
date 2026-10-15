/**
 * Videos de «frase con musica» que se asignan a una modelo: el editor saca del video de referencia la frase y como esta colocada (OCR, igual
 * que hace el scraper), las guarda en el BANCO DE FRASES (con la cancion si se sabe) y las deja en el propio video de referencia. Despues, cuando
 * la modelo sube su video para ese encargo, sale con esa frase y con la cancion del video de referencia (ver portal/subir y queue.mjs).
 *
 * El panel marca el video con la etiqueta «meta:analizar_frase=1» al asignarlo; aqui se cambia por «meta:frase_banco=1» al terminar.
 */
import path from "path";
import { mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { config } from "./config.mjs";
import { downloadFromR2, keyDesdeUrl } from "./r2.mjs";
import { analizarLayoutTexto } from "./vision.mjs";

const ETIQUETA_PENDIENTE = "meta:analizar_frase=1";
const ETIQUETA_HECHO = "meta:frase_banco=1";
const SIN_CANCION = "Sin cancion";

const norm = (t) => String(t ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const tagValor = (tags, clave) => (tags ?? []).find((t) => t.startsWith(`${clave}=`))?.slice(clave.length + 1) ?? null;

/** Frase de los bloques de texto que se leen en pantalla (los bloques cercanos ya vienen unidos por el OCR). */
export function fraseDeLayout(layout) {
  const bloques = Array.isArray(layout?.bloques) ? layout.bloques : [];
  const texto = bloques.map((b) => String(b.texto ?? "")).join(" ").replace(/\s+/g, " ").trim();
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
        if (!layout && key) {
          await mkdir(dir, { recursive: true });
          const mp4 = path.join(dir, "ref.mp4");
          await downloadFromR2(key, mp4);
          layout = await analizarLayoutTexto(mp4);
        }
        const frase = fraseDeLayout(layout) ?? limpiarFrase(v.frase_detectada);

        // 1) La frase al banco (si no estaba ya), con la cancion del video
        let enBanco = null;
        if (frase) {
          const banco = await frasesDelBanco(supabase);
          enBanco = banco.find((f) => norm(f.frase) === norm(frase)) ?? null;
          if (!enBanco) {
            const cancion = tagValor(v.tags, "meta:cancion");
            const { error: eIns } = await supabase.from("banco_frases_canciones").insert({
              frase,
              cancion_nombre: cancion || SIN_CANCION,
              cancion_artista: tagValor(v.tags, "meta:artista"),
              audio_id_ig: tagValor(v.tags, "meta:audio_id"),
              puntuacion: 7,
              layout_json: layout,
              origen: "bot",
              veces_usada: 0,
              activa: true,
            });
            if (eIns) throw new Error(`no se pudo guardar la frase en el banco: ${eIns.message}`);
          }
        }

        // 2) Frase y colocacion en el propio video de referencia (asi la modelo recibe exactamente esa) y se quita la marca de pendiente
        const tags = [...(v.tags ?? []).filter((t) => t !== ETIQUETA_PENDIENTE), ETIQUETA_HECHO];
        await supabase.from("referencias_videos").update({ frase_detectada: frase ?? v.frase_detectada, layout_json: layout, tags }).eq("id", v.id);
        console.log(`[frases-ref] ${v.id}: ${frase ? `«${frase.slice(0, 60)}»${enBanco ? " (ya estaba en el banco)" : " guardada en el banco"}` : "sin frase legible (se usara una del banco)"}`);
      } catch (e) {
        console.error(`[frases-ref] ${v.id}:`, e.message);
        // Si falla, se quita la marca para no reintentar para siempre; la modelo recibira una frase del banco
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

/** Frase y colocacion que el video de referencia (el de la cancion) ya tiene guardadas; null si aun no se han sacado. */
export async function fraseDeReferencia(supabase, pieza) {
  const key = keyDesdeUrl(pieza.audio_referencia_url);
  if (!key) return null;
  const { data } = await supabase.from("referencias_videos").select("frase_detectada, layout_json, tags").eq("video_url", key).limit(1).maybeSingle();
  if ((data?.tags ?? []).includes(ETIQUETA_PENDIENTE)) return null; // aun se esta leyendo la frase del video: por ahora una del banco
  const frase = data?.frase_detectada?.trim();
  if (!frase) return null;
  return { frase, layout_json: data?.layout_json ?? null };
}
