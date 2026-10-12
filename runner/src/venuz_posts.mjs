/**
 * Envia a la COLA DE POSTS de Venuz los posts de OnlyFans que se han APROBADO en el panel («Posts por programar»).
 *
 * Solo se manda lo que cumple las tres condiciones: el post esta aprobado, la modelo tiene «Enviar a Venuz» activado y tiene un
 * «fan para el baul» configurado. Venuz no deja subir una foto suelta al baul de OnlyFans: lo hace «enviandola» a un fan (como
 * mensaje de pago de 5 $) y OnlyFans la guarda en el baul. Por eso cada foto sigue estos pasos (los mismos que usa la web de Venuz):
 *   1. POST /api/messages/upload-init            -> URL y token de subida
 *   2. POST upload.venuz.ai/.../upload-media-direct (multipart, Bearer token) -> processId / host / extra
 *   3. POST /api/vault/upload-send               -> la manda al fan y devuelve el id de la foto en el baul de OnlyFans
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
import { downloadFromR2Bucket } from "./r2.mjs";

const execFileAsync = promisify(execFile);
const MAX_POR_CICLO = 3;
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
    await sesion.enviar("POST", "/api/vault/upload-send", {
      json: { account_id: cuentaId, conversation_of_id: String(fanOfId), uploadedMedia: [{ processId: sub.processId, host: sub.host, extra: sub.extra, name: sub.name ?? nombre }], clientMessageId: randomUUID() },
    }),
    "guardar en el baul",
  );
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

let ocupado = false;

export async function cicloPostsVenuz(supabase) {
  if (ocupado || !config.venuzEmail || !config.venuzPassword) return;
  ocupado = true;
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
    const fan = new Map(modelos.map((m) => [m.id, String(m.posts_fan_baul)]));

    const { data: posts } = await supabase
      .from("posts_programados")
      .select("id, modelo_id, archivo_id, caption, programar_para, venuz_media_id")
      .eq("estado", "aprobado")
      .in("modelo_id", [...fan.keys()])
      .gt("programar_para", new Date(Date.now() + MARGEN_MIN * 60000).toISOString())
      .order("programar_para", { ascending: true })
      .limit(MAX_POR_CICLO);
    if (!posts?.length) return;

    const sesion = new SesionVenuz(config.venuzEmail, config.venuzPassword);
    for (const p of posts) {
      // «Reclamar»: solo uno lo procesa, aunque haya dos editores o se repita el ciclo
      const { data: reclamado } = await supabase.from("posts_programados").update({ estado: "programado", enviado_at: new Date().toISOString(), error: null }).eq("id", p.id).eq("estado", "aprobado").select("id");
      if (!reclamado?.length) continue;
      try {
        const [{ data: cuenta }, { data: archivo }] = await Promise.all([
          supabase.from("venuz_cuentas").select("id").eq("modelo_id", p.modelo_id).eq("activa", true).limit(1).maybeSingle(),
          supabase.from("of_archivos").select("storage_key, bucket, mime").eq("id", p.archivo_id).maybeSingle(),
        ]);
        if (!cuenta) throw new Error("La modelo ya no tiene un perfil activo vinculado en Venuz");
        if (!archivo) throw new Error("No se encontró la foto");
        if (!p.caption) throw new Error("El post no tiene caption");

        let mediaId = p.venuz_media_id ? Number(p.venuz_media_id) : null;
        if (!mediaId) {
          const foto = await leerFoto(archivo);
          mediaId = await subirAlBaul(sesion, { cuentaId: cuenta.id, fanOfId: fan.get(p.modelo_id), nombre: foto.nombre, mime: foto.mime, bytes: foto.bytes });
          await supabase.from("posts_programados").update({ venuz_media_id: mediaId }).eq("id", p.id);
          await ponerEnCategoriaPosts(sesion, cuenta.id, mediaId);
        }
        const postId = await crearPostEnCola(sesion, { cuentaId: cuenta.id, texto: p.caption, mediaId, fechaISO: new Date(p.programar_para).toISOString() });
        await supabase.from("posts_programados").update({ venuz_post_id: postId, estado: "programado", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
        console.log(`[posts-venuz] ${p.id} programado en Venuz para ${p.programar_para}`);
      } catch (e) {
        console.error(`[posts-venuz] ${p.id}:`, tapar(e.message));
        await supabase.from("posts_programados").update({ estado: "error", error: tapar(e.message).slice(0, 400), updated_at: new Date().toISOString() }).eq("id", p.id);
      }
    }
  } catch (e) {
    console.error("[posts-venuz] error inesperado:", tapar(e.message));
  } finally {
    ocupado = false;
  }
}
