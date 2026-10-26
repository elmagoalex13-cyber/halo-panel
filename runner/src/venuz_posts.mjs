/**
 * Envia a la COLA DE POSTS de Venuz los posts de OnlyFans que se han APROBADO en el panel («Posts por programar»).
 *
 * Solo se manda lo que cumple las tres condiciones: el post esta aprobado, la modelo tiene «Enviar a Venuz» activado y tiene un
 * «fan para el baul» configurado. Venuz no deja subir una foto suelta al baul de OnlyFans: lo hace «enviandola» a un fan como mensaje
 * (SIN precio: mensaje gratis) y OnlyFans la guarda en el baul. Por eso cada foto sigue estos pasos:
 *   1. POST /api/messages/upload-init            -> URL y token de subida
 *   2. POST upload.venuz.ai/.../upload-media-direct (multipart, Bearer token) -> processId / host / extra
 *   3. POST /api/messages/send                   -> la manda al fan SIN precio (gratis) y devuelve el id de la foto en el baul de OnlyFans
 *      (no se usa /api/vault/upload-send: ese la manda siempre como mensaje de pago de 5 $)
 *   4. POST /api/vault/of/categories/<id>/media  -> (opcional) la mete en la categoria «POSTS» del baul
 *   5. POST /api/queue/posts                     -> programa el post (texto, foto, fecha) en la cola
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { readFile, rm, mkdir } from "fs/promises";
import path from "path";
import { config } from "./config.mjs";
import { SesionVenuz } from "./venuz.mjs";
import { agenciasVenuz, leerOrigen } from "./venuz_comun.mjs";
import { downloadFromR2Bucket } from "./r2.mjs";

const execFileAsync = promisify(execFile);
const MAX_POR_CICLO = 120; // posts que se reparten entre las cuentas en cada vuelta
const CONCURRENCIA = 5; // cuentas (modelos) que se procesan a la vez; dentro de una cuenta los posts van de uno en uno
const HUECO_MS = 11500; // OnlyFans exige >10 s entre dos posts programados de la misma cuenta («Please allow 10 seconds»)
const REINTENTOS = 3;
const MARGEN_MIN = 20; // no se programa nada que quede a menos de 20 min
const URL_UPLOAD = "https://crm-api-next.venuz.ai";

const tapar = (t) => String(t ?? "").replace(/Bearer\s+\S+/gi, "Bearer ***").replace(/"?(token|password|extra)"?\s*[:=]\s*"?[^",}\s]+/gi, "$1=***");
const resumen = (r) => `HTTP ${r.status}: ${tapar(typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo)).slice(0, 220)}`;
const ok = (r, paso) => {
  if (r.status < 200 || r.status >= 300) throw new Error(`${paso} fallo (${resumen(r)})`);
  return r.cuerpo;
};

/** Sube una foto al baul de OnlyFans de la cuenta (a traves de Venuz). Devuelve el id de la foto en OnlyFans. */
export async function subirAlBaul(sesion, { cuentaId, fanOfId, nombre, mime, bytes }) {
  const ini = ok(await sesion.enviar("POST", "/api/messages/upload-init", { json: { account_id: cuentaId, mime_type: mime, size_bytes: bytes.length, original_name: nombre } }), "upload-init");
  if (!ini?.upload_url || !ini?.upload_token) throw new Error("upload-init no devolvio URL o token de subida");
  const form = new FormData();
  form.append("file", new File([bytes], nombre, { type: mime }));
  const sub = ok(await sesion.enviar("POST", "", { form, bearer: ini.upload_token, url: /^https?:/.test(ini.upload_url) ? ini.upload_url : `${URL_UPLOAD}${ini.upload_url}` }), "subida del archivo");
  if (!sub?.processId || !sub?.host || !sub?.extra) throw new Error("La subida no devolvio los datos de procesado de OnlyFans");
  const env = ok(
    await sesion.enviar("POST", "/api/messages/send", {
      // sin «price»: el mensaje va gratis
      json: { account_id: cuentaId, conversation_of_id: String(fanOfId), text: "", uploadedMedia: [{ processId: sub.processId, host: sub.host, extra: sub.extra, name: sub.name ?? nombre }], clientMessageId: randomUUID() },
    }),
    "enviar la foto al fan (baul)",
  );
  if (env?.is_ppv || Number(env?.ppv_price) > 0) console.warn("[posts-venuz] AVISO: Venuz ha enviado la foto al fan como mensaje de pago, no gratis");
  const mediaId = Number(env?.media?.[0]?.id);
  if (!Number.isFinite(mediaId) || mediaId <= 0) throw new Error("Venuz no devolvio el id de la foto en el baul");
  return mediaId;
}

/** Mete la foto en la categoria «POSTS» del baul (si existe). Es un adorno: si falla, el post se programa igual. */
export async function ponerEnCategoriaPosts(sesion, cuentaId, mediaId) {
  try {
    const r = await sesion.enviar("GET", `/api/vault/of/categories?account_id=${cuentaId}&offset=0`);
    const lista = r.cuerpo?.categories ?? r.cuerpo?.list ?? [];
    const cat = lista.find((c) => /posts/i.test(String(c.name ?? "")));
    const id = cat?.of_list_id ?? cat?.id;
    if (!id) return false;
    const m = await sesion.enviar("POST", `/api/vault/of/categories/${id}/media`, { json: { account_id: cuentaId, media_ids: [mediaId] } });
    return m.status < 300;
  } catch {
    return false;
  }
}

/** Programa el post en la cola de Venuz. Devuelve el id del post (sirve para borrarlo o cambiarlo mientras no se publique). */
export async function crearPostEnCola(sesion, { cuentaId, texto, mediaId, fechaISO }) {
  const r = ok(await sesion.enviar("POST", "/api/queue/posts", { json: { account_id: cuentaId, text: texto, media_files: [mediaId], scheduled_date: fechaISO, rf_tag: [], rf_guest: [], rf_partner: [] } }), "programar el post");
  const id = r?.id ?? r?.entityId;
  if (!id) throw new Error("Venuz no devolvio el id del post");
  return String(id);
}

/** Lee la foto original de R2 y la deja en JPEG/PNG (las fotos HEIC del iPhone se convierten sin perder calidad apreciable). */
async function leerFoto(archivo) {
  const dir = path.join(config.tmpDir, "posts-venuz");
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const origen = path.join(dir, `${id}.src`);
  try {
    await downloadFromR2Bucket(archivo.bucket, archivo.storage_key, origen);
    const mime = String(archivo.mime ?? "").toLowerCase();
    if (mime === "image/jpeg" || mime === "image/png") {
      return { bytes: await readFile(origen), mime, nombre: `${id}.${mime === "image/png" ? "png" : "jpg"}` };
    }
    const salida = path.join(dir, `${id}.jpg`);
    await execFileAsync(config.ffmpeg, ["-y", "-i", origen, "-frames:v", "1", "-q:v", "2", salida]);
    const bytes = await readFile(salida);
    await rm(salida, { force: true });
    return { bytes, mime: "image/jpeg", nombre: `${id}.jpg` };
  } finally {
    await rm(origen, { force: true });
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const esLimite = (e) => /HTTP 429|rate_limited|Please allow/i.test(String(e?.message ?? e));
// Venuz a veces dice que la foto «ya no esta en el baul» cuando acaba de subirse (su copia del baul tarda en ponerse al dia): se reintenta mas tarde, sin volver a subir la foto
const esFotoAunNoVista = (e) => /media_gone|no longer in the creator'?s OnlyFans vault/i.test(String(e?.message ?? e));
const MAX_INTENTOS_FOTO = 8;
const ESPERA_FOTO_MIN = 8;

/** Repite el paso si OnlyFans pide esperar unos segundos (limite de velocidad), en lugar de dar el post por fallido. */
async function conReintento(paso) {
  for (let i = 1; ; i++) {
    try {
      return await paso();
    } catch (e) {
      if (!esLimite(e) || i >= REINTENTOS) throw e;
      await esperar(HUECO_MS);
    }
  }
}

const ultimoPost = new Map(); // cuenta de Venuz -> cuando se programo su ultimo post (para dejar pasar los 10 s)
async function esperarHueco(cuentaId) {
  const falta = (ultimoPost.get(cuentaId) ?? 0) + HUECO_MS - Date.now();
  if (falta > 0) await esperar(falta);
}

let ocupado = false;
let revisarTandas = true; // hay que comprobar si alguna modelo se ha quedado con TODOS sus posts programados (al arrancar y cada vez que se procesa algo)

/**
 * Aviso «todos los posts programados»: cuando de una modelo no queda ningun post aprobado esperando ni con error y se han programado posts desde el ultimo aviso,
 * se deja un aviso para el dashboard (panel_config «posts_avisos») y otro para Telegram.
 */
async function avisarTandasCompletas(supabase, modeloIds) {
  if (!modeloIds.length) return;
  const ahora = new Date().toISOString();
  const { data: cfg } = await supabase.from("panel_config").select("value").eq("key", "posts_avisos").maybeSingle();
  if (!cfg) {
    // Primera vez: lo que ya estaba programado antes no cuenta como aviso nuevo
    await supabase.from("panel_config").upsert({ key: "posts_avisos", value: { lista: [], ultimo: Object.fromEntries(modeloIds.map((id) => [id, ahora])) }, updated_at: ahora });
    return;
  }
  const ultimo = cfg.value?.ultimo ?? {};
  const lista = cfg.value?.lista ?? [];
  const { data: modelos } = await supabase.from("modelos").select("id, nombre").in("id", modeloIds);
  let cambio = false;
  for (const m of modelos ?? []) {
    const { count: esperando } = await supabase.from("posts_programados").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("estado", "aprobado").gt("programar_para", ahora);
    const { count: conError } = await supabase.from("posts_programados").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("estado", "error");
    if (esperando || conError) continue;
    const { data: nuevos } = await supabase.from("posts_programados").select("programar_para").eq("modelo_id", m.id).eq("estado", "programado").not("venuz_post_id", "is", null).gt("enviado_at", ultimo[m.id] ?? "1970-01-01T00:00:00Z");
    if (!nuevos?.length) continue;
    const hasta = nuevos.map((x) => x.programar_para).filter(Boolean).sort().pop() ?? null;
    ultimo[m.id] = ahora;
    lista.unshift({ id: `${m.id}|${ahora}`, modelo_id: m.id, nombre: m.nombre, n: nuevos.length, hasta, at: ahora });
    await supabase.from("telegram_cola").insert({ tipo: "posts_programados", modelo_id: m.id, datos: { n: nuevos.length, hasta } });
    console.log(`[posts-venuz] ${m.nombre}: todos sus posts estan programados (${nuevos.length})`);
    cambio = true;
  }
  if (cambio) await supabase.from("panel_config").upsert({ key: "posts_avisos", value: { lista: lista.slice(0, 40), ultimo }, updated_at: new Date().toISOString() });
}

/** Procesa un post aprobado: sube la foto (si no estaba ya), la mete en el baul y programa el post. */
async function procesarPost(supabase, sesion, p, cuentaId, fanOfId) {
  // «Reclamar»: solo uno lo procesa, aunque haya dos editores o se repita el ciclo
  const { data: reclamado } = await supabase.from("posts_programados").update({ estado: "programado", enviado_at: new Date().toISOString(), error: null }).eq("id", p.id).eq("estado", "aprobado").select("id");
  if (!reclamado?.length) return;
  try {
    const { data: archivo } = await supabase.from("of_archivos").select("storage_key, bucket, mime").eq("id", p.archivo_id).maybeSingle();
    if (!archivo) throw new Error("No se encontró la foto");
    if (!p.caption) throw new Error("El post no tiene caption");

    let mediaId = p.venuz_media_id ? Number(p.venuz_media_id) : null;
    if (!mediaId) {
      const foto = await leerFoto(archivo);
      mediaId = await conReintento(() => subirAlBaul(sesion, { cuentaId, fanOfId, nombre: foto.nombre, mime: foto.mime, bytes: foto.bytes }));
      await supabase.from("posts_programados").update({ venuz_media_id: mediaId }).eq("id", p.id);
      if (!(await ponerEnCategoriaPosts(sesion, cuentaId, mediaId))) console.warn(`[posts-venuz] ${p.id}: la foto no se pudo meter en la categoria POSTS del baul (se intenta programar igual)`);
    }
    const postId = await conReintento(async () => {
      await esperarHueco(cuentaId);
      try {
        return await crearPostEnCola(sesion, { cuentaId, texto: p.caption, mediaId, fechaISO: new Date(p.programar_para).toISOString() });
      } finally {
        ultimoPost.set(cuentaId, Date.now());
      }
    });
    await supabase.from("posts_programados").update({ venuz_post_id: postId, estado: "programado", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
    console.log(`[posts-venuz] ${p.id} programado en Venuz para ${p.programar_para}`);
  } catch (e) {
    console.error(`[posts-venuz] ${p.id}:`, tapar(e.message));
    if (esFotoAunNoVista(e)) {
      const intento = (Number(String(p.error ?? "").match(/intento (\d+)/)?.[1]) || 0) + 1;
      if (intento < MAX_INTENTOS_FOTO) {
        await supabase.from("posts_programados").update({ estado: "aprobado", error: `Venuz aún no ve la foto en el baúl: se reintenta solo en unos minutos (intento ${intento} de ${MAX_INTENTOS_FOTO})`, enviado_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.id);
        console.log(`[posts-venuz] ${p.id}: Venuz aun no ve la foto, reintento ${intento}/${MAX_INTENTOS_FOTO}`);
        return;
      }
    }
    if (esLimite(e)) {
      // OnlyFans pidio esperar y se agotaron los reintentos: vuelve a la cola para la siguiente vuelta (la foto ya esta en el baul, no se vuelve a subir)
      await supabase.from("posts_programados").update({ estado: "aprobado", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
    } else {
      await supabase.from("posts_programados").update({ estado: "error", error: tapar(e.message).slice(0, 400), updated_at: new Date().toISOString() }).eq("id", p.id);
    }
  }
}

export async function cicloPostsVenuz(supabase) {
  const agencias = agenciasVenuz().filter((a) => a.email && a.password);
  if (ocupado || !agencias.length) return;
  ocupado = true;
  let activas = [];
  try {
    // Lo que se quedo a medias (el editor se reinicio): se avisa, no se reintenta solo por si ya esta en la cola de Venuz
    await supabase
      .from("posts_programados")
      .update({ estado: "error", error: "Se interrumpió el envío: mira en la cola de Venuz si el post ya está antes de volver a aprobarlo", updated_at: new Date().toISOString() })
      .eq("estado", "programado")
      .is("venuz_post_id", null)
      .lt("enviado_at", new Date(Date.now() - 15 * 60000).toISOString());

    const { data: modelos, error } = await supabase.from("modelos").select("id, posts_fan_baul").eq("posts_venuz_activo", true).not("posts_fan_baul", "is", null);
    if (error || !modelos?.length) return; // sin el SQL de posts o sin modelos activadas
    activas = modelos.map((m) => m.id);
    const fan = new Map(modelos.map((m) => [m.id, String(m.posts_fan_baul)]));

    const { data: posts } = await supabase
      .from("posts_programados")
      .select("id, modelo_id, archivo_id, caption, programar_para, venuz_media_id, error")
      .eq("estado", "aprobado")
      .in("modelo_id", [...fan.keys()])
      .gt("programar_para", new Date(Date.now() + MARGEN_MIN * 60000).toISOString())
      .or(`enviado_at.is.null,enviado_at.lt.${new Date(Date.now() - ESPERA_FOTO_MIN * 60000).toISOString()}`) // los reintentos esperan unos minutos
      .order("programar_para", { ascending: true })
      .limit(MAX_POR_CICLO);
    if (!posts?.length) return;
    revisarTandas = true;

    // Una cuenta de Venuz por modelo: cada cuenta lleva sus posts en orden (con su pausa de 10 s) y varias cuentas avanzan a la vez
    const { data: cuentas } = await supabase.from("venuz_cuentas").select("id, modelo_id").eq("activa", true).in("modelo_id", [...fan.keys()]);
    const cuentaDe = new Map((cuentas ?? []).map((c) => [c.modelo_id, c.id]));
    const porCuenta = new Map();
    for (const p of posts) {
      const cuentaId = cuentaDe.get(p.modelo_id);
      if (!cuentaId) {
        await supabase.from("posts_programados").update({ estado: "error", error: "La modelo ya no tiene un perfil activo vinculado en Venuz", updated_at: new Date().toISOString() }).eq("id", p.id).eq("estado", "aprobado");
        continue;
      }
      porCuenta.set(cuentaId, [...(porCuenta.get(cuentaId) ?? []), p]);
    }

    // Cada creadora se programa con SU cuenta de Venuz (la tuya o la de tu socio): una sesion por cuenta
    const origen = await leerOrigen(supabase);
    const sesiones = new Map();
    const sesionDe = (cuentaId) => {
      const etiqueta = origen[cuentaId] ?? "dueno";
      const ag = agencias.find((a) => a.etiqueta === etiqueta);
      if (!ag) return null;
      if (!sesiones.has(etiqueta)) sesiones.set(etiqueta, new SesionVenuz(ag.email, ag.password));
      return sesiones.get(etiqueta);
    };
    const colas = [...porCuenta.entries()];
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < colas.length) {
        const [cuentaId, lista] = colas[siguiente++];
        const sesion = sesionDe(cuentaId);
        if (!sesion) {
          const quien = (origen[cuentaId] ?? "dueno") === "socio" ? "tu socio" : "tu cuenta";
          for (const p of lista) await supabase.from("posts_programados").update({ estado: "error", error: `Falta el usuario y la contraseña de Venuz de ${quien} en el servidor`, updated_at: new Date().toISOString() }).eq("id", p.id).eq("estado", "aprobado");
          continue;
        }
        for (const p of lista) await procesarPost(supabase, sesion, p, cuentaId, fan.get(p.modelo_id));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, colas.length) }, trabajador));
  } catch (e) {
    console.error("[posts-venuz] error inesperado:", tapar(e.message));
  } finally {
    if (revisarTandas && activas.length) {
      revisarTandas = false;
      await avisarTandasCompletas(supabase, activas).catch((e) => {
        revisarTandas = true; // se reintenta en la siguiente vuelta
        console.error("[posts-venuz] aviso de posts programados:", tapar(e.message));
      });
    }
    ocupado = false;
  }
}
