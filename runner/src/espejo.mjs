/**
 * «Videos de bienvenida»: la modelo nueva (al firmar el contrato el panel la apunta en panel_config.modelos_espejo con la hora a la que le toca,
 * una hora despues) recibe en su portal, UNA SOLA VEZ, los ULTIMOS 40 videos distintos que se hayan asignado a las demas modelos en ese momento.
 * Despues no se le copia nada mas. No se quita nada de lo que ya tenga y a quien ya tiene un video no se le repite.
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

/** Asigna a la modelo los ultimos 40 videos distintos asignados a las demas. Devuelve cuantos se le han asignado. */
export async function asignarUltimos(sb, modeloId) {
  const { data: propios } = await sb.from("encargos").select("referencia_id").eq("modelo_id", modeloId).not("referencia_id", "is", null).limit(5000);
  const tiene = new Set((propios ?? []).map((e) => e.referencia_id));

  // Los ultimos 40 videos distintos asignados a las demas (del mas nuevo al mas viejo)
  const { data } = await sb.from("encargos").select("referencia_id, tipo_video, instrucciones, created_at").neq("modelo_id", modeloId).not("referencia_id", "is", null).order("created_at", { ascending: false }).limit(1500);
  const vistos = new Set();
  const nuevos = [];
  for (const e of data ?? []) {
    if (vistos.has(e.referencia_id)) continue;
    vistos.add(e.referencia_id);
    if (vistos.size > ULTIMOS) break;
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
