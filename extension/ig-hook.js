// Se inyecta en instagram.com (world MAIN, document_start). Instagram no deja leer los reels de un
// perfil con una llamada directa: la propia pagina los descarga por GraphQL. Aqui solo se escuchan
// esas respuestas (fetch y XHR) y se guardan las metricas en window.__halo; la extension las lee luego.
(() => {
  if (window.__halo) return;
  const store = { items: new Map(), respuestas: 0 };
  window.__halo = store;

  const num = (v) => Math.max(0, Number(v ?? 0) || 0);
  const PROPIO = /clips.*user|user.*clips|user_timeline|feed__user|profile.*(reel|post)/i;

  function walk(o, d, propio) {
    if (!o || typeof o !== "object" || d > 14) return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x, d + 1, propio);
      return;
    }
    if (typeof o.code === "string" && /^[A-Za-z0-9_-]{5,20}$/.test(o.code) && (o.play_count !== undefined || o.ig_play_count !== undefined)) {
      const previo = store.items.get(o.code);
      store.items.set(o.code, {
        codigo: o.code,
        vistas: num(o.play_count ?? o.ig_play_count),
        likes: num(o.like_count),
        comentarios: num(o.comment_count),
        compartidos: num(o.reshare_count ?? o.share_count),
        fecha: o.taken_at ? new Date(o.taken_at * 1000).toISOString() : null,
        miniatura: o.image_versions2?.candidates?.[0]?.url ?? null,
        esVideo: o.media_type === 2 || o.product_type === "clips" || Boolean(o.video_versions?.length),
        usuario: o.user?.username ?? o.owner?.username ?? null,
        propio: Boolean(propio || previo?.propio),
      });
    }
    for (const k in o) walk(o[k], d + 1, propio);
  }

  function procesar(texto) {
    try {
      const j = JSON.parse(String(texto).replace(/^for \(;;\);/, ""));
      const data = j?.data ?? j;
      const propio = Object.keys(data && typeof data === "object" ? data : {}).some((k) => PROPIO.test(k));
      store.respuestas++;
      walk(data, 0, propio);
    } catch {
      /* no era JSON */
    }
  }

  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const res = await fetchOriginal.apply(this, args);
    try {
      const url = String(args[0]?.url ?? args[0]);
      if (/graphql|api\/v1/.test(url)) res.clone().text().then(procesar).catch(() => {});
    } catch {
      /* ignorar */
    }
    return res;
  };

  const enviar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        if (/graphql|api\/v1/.test(this.responseURL)) procesar(this.responseText);
      } catch {
        /* ignorar */
      }
    });
    return enviar.apply(this, args);
  };
})();
