// Se inyecta en instagram.com (world MAIN, document_start). Instagram no deja leer los reels de un
// perfil con una llamada directa: la propia pagina los descarga por GraphQL. Aqui se escuchan esas
// respuestas (fetch y XHR), se guardan las metricas en window.__halo y se recuerda la consulta de
// "reels del perfil" para poder pedir las paginas siguientes aunque la pestana este en segundo plano
// (en una pestana oculta Instagram no carga mas reels al hacer scroll).
(() => {
  if (window.__halo) return;
  const store = { items: new Map(), respuestas: 0, consulta: null, inicial: null, cursor: null, hayMas: false };
  window.__halo = store;

  const fetchOriginal = window.fetch;
  const num = (v) => Math.max(0, Number(v ?? 0) || 0);
  const PROPIO = /clips.*user|user.*clips|user_timeline|feed__user|profile.*(reel|post)|XDTUserDict/i;
  const ES_CONSULTA_REELS = /ProfileReelsTabContentQuery_connection/;
  const ES_CONSULTA_INICIAL = /^PolarisProfileReelsTabContentQuery$/;
  const NOMBRE_CONEXION = "PolarisProfileReelsTabContentQuery_connection";
  // Identificador de la consulta paginada; solo se usa si la pagina no llego a lanzarla (pestana oculta).
  const DOC_CONEXION = "28989741540630190";

  function walk(o, d, propio, acc) {
    if (!o || typeof o !== "object" || d > 14) return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x, d + 1, propio, acc);
      return;
    }
    if (o.page_info && o.page_info.end_cursor !== undefined && !acc.pageInfo) acc.pageInfo = o.page_info;
    if (typeof o.code === "string" && /^[A-Za-z0-9_-]{5,20}$/.test(o.code) && (o.play_count !== undefined || o.ig_play_count !== undefined)) {
      acc.n++;
      const previo = store.items.get(o.code);
      store.items.set(o.code, {
        codigo: o.code,
        vistas: num(o.play_count ?? o.ig_play_count),
        likes: num(o.like_count),
        comentarios: num(o.comment_count),
        compartidos: num(o.media_repost_count ?? o.reshare_count ?? o.share_count),
        fecha: o.taken_at ? new Date(o.taken_at * 1000).toISOString() : null,
        miniatura: o.image_versions2?.candidates?.[0]?.url ?? null,
        esVideo: o.media_type === 2 || o.product_type === "clips" || Boolean(o.video_versions?.length),
        usuario: o.user?.username ?? o.owner?.username ?? null,
        propio: Boolean(propio || previo?.propio),
      });
    }
    for (const k in o) walk(o[k], d + 1, propio, acc);
  }

  function procesar(texto, peticion) {
    try {
      const j = JSON.parse(String(texto).replace(/^for \(;;\);/, ""));
      const data = j?.data ?? j;
      const propio = Object.keys(data && typeof data === "object" ? data : {}).some((k) => PROPIO.test(k));
      const acc = { n: 0, pageInfo: null };
      store.respuestas++;
      walk(data, 0, propio, acc);
      // Respuesta de la lista de reels del perfil: recordar cursor y, si es la consulta paginable, la propia consulta.
      if (acc.n && acc.pageInfo) {
        store.cursor = acc.pageInfo.end_cursor ?? null;
        store.hayMas = Boolean(acc.pageInfo.has_next_page);
        if (peticion && ES_CONSULTA_REELS.test(peticion.nombre)) store.consulta = peticion;
        if (peticion && ES_CONSULTA_INICIAL.test(peticion.nombre)) store.inicial = peticion;
      }
    } catch {
      /* no era JSON */
    }
  }

  const nombreDe = (cuerpo) => {
    try {
      return new URLSearchParams(String(cuerpo)).get("fb_api_req_friendly_name") ?? "";
    } catch {
      return "";
    }
  };

  window.fetch = async function (...args) {
    const res = await fetchOriginal.apply(this, args);
    try {
      const url = String(args[0]?.url ?? args[0]);
      if (/graphql|api\/v1/.test(url)) res.clone().text().then((t) => procesar(t, null)).catch(() => {});
    } catch {
      /* ignorar */
    }
    return res;
  };

  const abrir = XMLHttpRequest.prototype.open;
  const cabecera = XMLHttpRequest.prototype.setRequestHeader;
  const enviar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__halo = { metodo, url, cabeceras: {} };
    return abrir.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__halo) this.__halo.cabeceras[k] = v;
    return cabecera.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (cuerpo) {
    this.addEventListener("load", () => {
      try {
        if (!/graphql|api\/v1/.test(this.responseURL)) return;
        const info = this.__halo;
        const peticion = info && typeof cuerpo === "string"
          ? { url: info.url, metodo: info.metodo, cabeceras: info.cabeceras, cuerpo, nombre: nombreDe(cuerpo) }
          : null;
        procesar(this.responseText, peticion);
      } catch {
        /* ignorar */
      }
    });
    return enviar.apply(this, arguments);
  };

  // Pide paginas siguientes repitiendo la consulta de la propia pagina con el cursor. Devuelve cuantas paginas pidio.
  // La consulta paginada es la inicial con otro doc_id y estas variables (cursor `after`, `first`, `id`).
  function derivarConsulta(ini) {
    const p = new URLSearchParams(ini.cuerpo);
    const v = JSON.parse(p.get("variables") || "{}");
    p.set("doc_id", DOC_CONEXION);
    p.set("fb_api_req_friendly_name", NOMBRE_CONEXION);
    const nv = { after: null, data: v.data, first: 12, id: v.user_id ?? v.data?.target_user_id };
    for (const k in v) if (k.startsWith("__relay_internal__")) nv[k] = v[k];
    p.set("variables", JSON.stringify(nv));
    return { ...ini, cuerpo: p.toString(), cabeceras: { ...ini.cabeceras, "X-FB-Friendly-Name": NOMBRE_CONEXION }, nombre: NOMBRE_CONEXION };
  }

  store.paginar = async function (maximo) {
    const c = store.consulta ?? (store.inicial ? derivarConsulta(store.inicial) : null);
    if (!c) return { ok: false, motivo: "sin_consulta", paginas: 0 };
    let paginas = 0;
    let ultimoCursor = null;
    while (!store.cancelar && store.items.size < maximo && store.hayMas && store.cursor && store.cursor !== ultimoCursor && paginas < 30) {
      ultimoCursor = store.cursor;
      const p = new URLSearchParams(c.cuerpo);
      const variables = JSON.parse(p.get("variables") || "{}");
      variables.after = store.cursor;
      variables.first = 12;
      p.set("variables", JSON.stringify(variables));
      const url = c.url.startsWith("http") ? c.url : location.origin + c.url;
      const res = await fetchOriginal(url, { method: c.metodo || "POST", credentials: "include", headers: c.cabeceras, body: p.toString() });
      if (res.status === 429) return { ok: false, motivo: "limite", paginas };
      procesar(await res.text(), c);
      paginas++;
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));
    }
    return { ok: true, paginas };
  };
})();
