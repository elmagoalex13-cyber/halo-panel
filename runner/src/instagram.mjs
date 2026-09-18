/**
 * Acceso propio a Instagram (sin Apify). Usa la web/API de Instagram con una sesion iniciada:
 * pon en el .env del runner la cookie `sessionid` de una cuenta de Instagram dedicada (IG_SESSIONID).
 * Sin sesion solo funciona a ratos (Instagram suele responder 429 a las IPs de servidor).
 */
import { config } from "./config.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function cabeceras() {
  const h = {
    "User-Agent": UA,
    "x-ig-app-id": "936619743392459",
    "x-requested-with": "XMLHttpRequest",
    Accept: "*/*",
    "Accept-Language": "es-ES,es;q=0.9",
  };
  if (config.igSessionId) {
    const csrf = config.igCsrf ?? "halo";
    h.Cookie = `sessionid=${config.igSessionId}; csrftoken=${csrf}`;
    h["x-csrftoken"] = csrf;
  }
  return h;
}

async function getJson(url) {
  const res = await fetch(url, { headers: cabeceras(), signal: AbortSignal.timeout(30000) });
  if (res.status === 429) throw new Error("Instagram limita las peticiones (429). Configura IG_SESSIONID o espera un rato");
  if (res.status === 401 || res.status === 403) throw new Error(`Instagram ${res.status}: hace falta una sesion valida (IG_SESSIONID)`);
  if (!res.ok) throw new Error(`Instagram ${res.status}`);
  return res.json();
}

const num = (v) => Math.max(0, Number(v ?? 0) || 0);

/** Item del feed de usuario (API interna): /api/v1/feed/user/<usuario>/username/ */
export function parsearItemFeed(it) {
  const esVideo = it.media_type === 2 || Boolean(it.video_versions?.length);
  return {
    codigo: it.code ?? null,
    vistas: num(it.play_count ?? it.view_count ?? it.ig_play_count),
    likes: num(it.like_count),
    comentarios: num(it.comment_count),
    compartidos: num(it.reshare_count ?? it.share_count),
    videoUrl: it.video_versions?.[0]?.url ?? null,
    miniatura: it.image_versions2?.candidates?.[0]?.url ?? null,
    descripcion: it.caption?.text ?? null,
    fecha: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null,
    esVideo,
  };
}

/** Nodo de web_profile_info (GraphQL web). */
export function parsearNodoWeb(n) {
  return {
    codigo: n.shortcode ?? null,
    vistas: num(n.video_view_count ?? n.video_play_count),
    likes: num(n.edge_liked_by?.count ?? n.edge_media_preview_like?.count),
    comentarios: num(n.edge_media_to_comment?.count ?? n.edge_media_preview_comment?.count),
    compartidos: 0,
    videoUrl: n.video_url ?? null,
    miniatura: n.display_url ?? n.thumbnail_src ?? null,
    descripcion: n.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
    fecha: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
    esVideo: Boolean(n.is_video),
  };
}

/** Ultimos reels/videos de una cuenta, ya normalizados. */
export async function reelsDeCuenta(username, max = 30) {
  const usuario = encodeURIComponent(username.replace(/^@/, ""));
  const errores = [];
  if (config.igSessionId) {
    try {
      const j = await getJson(`https://www.instagram.com/api/v1/feed/user/${usuario}/username/?count=${max}`);
      const items = (j.items ?? []).map(parsearItemFeed);
      if (items.length) return items;
    } catch (e) {
      errores.push(e.message);
    }
  }
  try {
    const j = await getJson(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${usuario}`);
    const edges = j?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];
    return edges.map((e) => parsearNodoWeb(e.node));
  } catch (e) {
    errores.push(e.message);
  }
  throw new Error(errores.join(" | "));
}

// ---------- Un video concreto a partir de su URL ----------

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function codigoDeUrl(url) {
  return String(url).match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

export function pkDeCodigo(codigo) {
  let id = 0n;
  for (const c of codigo.slice(0, 11)) id = id * 64n + BigInt(ALFABETO.indexOf(c));
  return id.toString();
}

function limpiarEscapes(s) {
  return s.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
}

/**
 * Datos descargables de una URL: { videoUrl, miniatura, descripcion }.
 * - URL directa de video (.mp4/.mov/.webm): se usa tal cual.
 * - URL de Instagram: API interna con sesion (IG_SESSIONID) o, si no, la pagina embed publica.
 */
export async function infoDeUrl(url) {
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return { videoUrl: url, miniatura: null, descripcion: null };
  const codigo = codigoDeUrl(url);
  if (!codigo) throw new Error("URL no reconocida (usa un enlace de reel de Instagram o un .mp4 directo)");

  const errores = [];
  if (config.igSessionId) {
    try {
      const j = await getJson(`https://www.instagram.com/api/v1/media/${pkDeCodigo(codigo)}/info/`);
      const item = parsearItemFeed(j.items?.[0] ?? {});
      if (item.videoUrl) return { videoUrl: item.videoUrl, miniatura: item.miniatura, descripcion: item.descripcion };
    } catch (e) {
      errores.push(e.message);
    }
  }
  try {
    const res = await fetch(`https://www.instagram.com/reel/${codigo}/embed/captioned/`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    const html = await res.text();
    const v = html.match(/"video_url":"([^"]+)"/)?.[1] ?? html.match(/<video[^>]+src="([^"]+)"/)?.[1];
    if (v) {
      const t = html.match(/"display_url":"([^"]+)"/)?.[1] ?? html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/)?.[1] ?? null;
      const d = html.match(/"caption":"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
      return { videoUrl: limpiarEscapes(v), miniatura: t ? limpiarEscapes(t) : null, descripcion: d ? JSON.parse(`"${d}"`) : null };
    }
    errores.push("la pagina embed no trae el video");
  } catch (e) {
    errores.push(e.message);
  }
  throw new Error(`No se pudo obtener el video de Instagram: ${errores.join(" | ")}`);
}
