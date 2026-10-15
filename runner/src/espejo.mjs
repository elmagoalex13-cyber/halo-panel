/**
 * «Videos de bienvenida»: la modelo nueva (al firmar el contrato el panel la apunta en panel_config.modelos_espejo con la hora a la que le toca,
 * una hora despues) recibe en su portal, UNA SOLA VEZ, los ULTIMOS 40 videos distintos que se hayan asignado a las demas modelos en ese momento.
 * Solo cuentan videos de modelos reales (no las de prueba) y videos para asignar (no los de frases con musica que solo van al banco). Despues no se le copia nada mas. No se quita nada de lo que ya tenga y a quien ya tiene un video no se le repite.
 */
const CLAVE = "modelos_espejo";
const ULTIMOS = 40;

async function leer(sb) {
  const { data } = await sb.from("panel_config").select("value, updated_at").eq("key", CLAVE).maybeSingle();
  return { entradas: Array.isArray(data?.value?.modelos) ? data.value.modelos : [], updated_at: data?.updated_at ?? null };
}

/** Cambia una entrada de la lista con «comparar y cambiar» (el panel tambien la toca). */
async function actualizar(sb, modeloId, cambios) {
  for (let i = 0; i < 5; i++) {
    const { entradas, updated_at } = await leer(sb);
    if (!updated_at || !entradas.some((e) => e.id === modeloId)) return; // la cancelaron mientras tanto
    const nuevas = entradas.map((e) => (e.id === modeloId ? { ...e, ...cambios } : e));
    const { data } = await sb.from("panel_config").update({ value: { modelos: nuevas }, updated_at: new Date().toISOString() }).eq("key", CLAVE).eq("updated_at", updated_at).select("key");
    if (data?.length) return;
  }
}

let ocupado = false;

export async function cicloEspejo(sb) {
  if (ocupado) return;
  ocupado = true;
  try {
    const { entradas } = await leer(sb);
    const ahora = Date.now();
    for (const m of entradas) {
      // Entradas del sistema anterior (copiaba tambien lo nuevo): ya no se usa, se dejan como hechas
      if (!m.due && !m.hecho_at) {
        await actualizar(sb, m.id, { due: new Date(0).toISOString(), hecho_at: new Date().toISOString(), n: 0 });
        continue;
      }
      if (m.hecho_at || new Date(m.due).getTime() > ahora) continue;
      try {
        const n = await asignarUltimos(sb, m.id);
        await actualizar(sb, m.id, { hecho_at: new Date().toISOString(), n });
      } catch (e) {
        console.error(`[bienvenida] ${m.id}:`, e.message); // se reintenta en el siguiente ciclo
      }
    }
  } catch (e) {
    console.error("[bienvenida] error inesperado:", e.message);
  } finally {
    ocupado = false;
  }
}

const TAGS_SOLO_BANCO = ["meta:frase_banco=1", "meta:analizar_frase=1", "meta:frase_falta=1", "meta:frase_manual=1"];
const codigoDe = (url) => /\/reel\/([^/?#]+)/.exec(url ?? "")?.[1] ?? /([^/]+)\.mp4$/.exec(url ?? "")?.[1] ?? null;

/** Codigos de los videos que solo sirven para el banco de frases (nunca se asignan a una modelo). */
async function codigosSoloBanco(sb) {
  const codigos = new Set();
  for (let desde = 0; ; desde += 1000) {
    const { data } = await sb.from("referencias_videos").select("video_url").overlaps("tags", TAGS_SOLO_BANCO).range(desde, desde + 999);
    for (const v of data ?? []) {
      const c = codigoDe(v.video_url);
      if (c) codigos.add(c);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return codigos;
}

/**
 * Asigna a la modelo los ultimos 40 videos distintos asignados a las demas. Devuelve cuantos se le han asignado.
 * Solo cuentan videos de modelos REALES (las de prueba, «modelo_test», no) y videos para asignar: los de frases con musica
 * que solo se guardan en el banco de frases no se asignan nunca.
 */
export async function asignarUltimos(sb, modeloId) {
  const { data: propios } = await sb.from("encargos").select("referencia_id").eq("modelo_id", modeloId).not("referencia_id", "is", null).limit(5000);
  const tiene = new Set((propios ?? []).map((e) => e.referencia_id));

  const { data: mods } = await sb.from("modelos").select("id, nombre");
  const excluidas = new Set([modeloId, ...(mods ?? []).filter((m) => /test|prueba/i.test(m.nombre ?? "")).map((m) => m.id)]);
  const soloBanco = await codigosSoloBanco(sb);

  // Los encargos mas nuevos de modelos reales (del mas nuevo al mas viejo), un video distinto cada vez
  const { data } = await sb.from("encargos").select("modelo_id, referencia_id, tipo_video, instrucciones, created_at").not("referencia_id", "is", null).order("created_at", { ascending: false }).limit(1500);
  const candidatos = [];
  const vistos = new Set();
  for (const e of data ?? []) {
    if (excluidas.has(e.modelo_id) || vistos.has(e.referencia_id)) continue;
    vistos.add(e.referencia_id);
    candidatos.push(e);
  }
  const urls = new Map();
  for (let i = 0; i < candidatos.length; i += 80) {
    const { data: refs } = await sb.from("referencias").select("id, url_original").in("id", candidatos.slice(i, i + 80).map((c) => c.referencia_id));
    for (const r of refs ?? []) urls.set(r.id, r.url_original);
  }

  const nuevos = [];
  let contados = 0;
  for (const e of candidatos) {
    const c = codigoDe(urls.get(e.referencia_id));
    if (c && soloBanco.has(c)) continue;
    if (++contados > ULTIMOS) break;
    if (tiene.has(e.referencia_id)) continue;
    nuevos.push({ modelo_id: modeloId, referencia_id: e.referencia_id, tipo_video: e.tipo_video, estado: "pendiente", instrucciones: e.instrucciones ?? null });
  }
  if (nuevos.length) {
    const { error } = await sb.from("encargos").insert(nuevos);
    if (error) throw new Error(`no se pudieron asignar los videos: ${error.message}`);
    await sb.from("telegram_cola").insert({ tipo: "modelo_asignacion", modelo_id: modeloId, datos: { n: nuevos.length } }).then(() => undefined, () => undefined);
  }
  console.log(`[bienvenida] ${modeloId}: ${nuevos.length} video(s) asignados (de los ultimos ${ULTIMOS} de las demas)`);
  return nuevos.length;
}
