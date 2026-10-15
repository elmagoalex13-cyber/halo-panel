/**
 * «Videos al dia»: las modelos apuntadas en panel_config.modelos_espejo (las nuevas, al firmar el contrato) reciben en su portal
 *  - al apuntarlas: los ULTIMOS 40 videos que se hayan asignado a las demas modelos (una vez), y
 *  - despues, cada video nuevo que se asigne a cualquier otra modelo (se copia el encargo: mismo video, mismo tipo, mismas indicaciones).
 * No se quita nada de lo que ya tengan; a quien ya tiene un video no se le repite. El panel solo apunta a la modelo; el trabajo se hace aqui cada minuto.
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
    if (!updated_at || !entradas.some((e) => e.id === modeloId)) return; // la quitaron mientras tanto
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
    for (const m of entradas) {
      try {
        await sincronizar(sb, m);
      } catch (e) {
        console.error(`[espejo] ${m.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[espejo] error inesperado:", e.message);
  } finally {
    ocupado = false;
  }
}

async function sincronizar(sb, m) {
  const { data: propios } = await sb.from("encargos").select("referencia_id").eq("modelo_id", m.id).not("referencia_id", "is", null).limit(5000);
  const tiene = new Set((propios ?? []).map((e) => e.referencia_id));

  // Encargos de las DEMAS modelos que hay que copiar
  let fuentes;
  if (m.inicial) {
    // Los ultimos 40 videos distintos asignados a las demas (del mas nuevo al mas viejo)
    const { data } = await sb.from("encargos").select("referencia_id, tipo_video, instrucciones, created_at").neq("modelo_id", m.id).not("referencia_id", "is", null).order("created_at", { ascending: false }).limit(1500);
    const vistos = new Set();
    fuentes = [];
    for (const e of data ?? []) {
      if (vistos.has(e.referencia_id)) continue;
      vistos.add(e.referencia_id);
      fuentes.push(e);
      if (fuentes.length >= ULTIMOS) break;
    }
  } else {
    const desde = m.desde ?? new Date().toISOString();
    const { data } = await sb.from("encargos").select("referencia_id, tipo_video, instrucciones, created_at").neq("modelo_id", m.id).not("referencia_id", "is", null).gt("created_at", desde).order("created_at", { ascending: true }).limit(400);
    fuentes = data ?? [];
  }

  const nuevos = [];
  const repetidos = new Set();
  for (const e of fuentes) {
    if (tiene.has(e.referencia_id) || repetidos.has(e.referencia_id)) continue;
    repetidos.add(e.referencia_id);
    nuevos.push({ modelo_id: m.id, referencia_id: e.referencia_id, tipo_video: e.tipo_video, estado: "pendiente", instrucciones: e.instrucciones ?? null });
  }
  if (nuevos.length) {
    const { error } = await sb.from("encargos").insert(nuevos);
    if (error) throw new Error(`no se pudieron asignar los videos: ${error.message}`);
    await sb.from("telegram_cola").insert({ tipo: "modelo_asignacion", modelo_id: m.id, datos: { n: nuevos.length } }).then(() => undefined, () => undefined);
    console.log(`[espejo] ${m.id}: ${nuevos.length} video(s) asignados${m.inicial ? " (los ultimos 40 de las demas)" : ""}`);
  }

  // Marca de hasta donde se ha copiado: el encargo mas nuevo visto (o ahora, si es la primera vez y no habia nada)
  const maxFecha = fuentes.reduce((mx, e) => (!mx || new Date(e.created_at).getTime() > new Date(mx).getTime() ? e.created_at : mx), m.desde ?? "");
  if (m.inicial || (maxFecha && maxFecha !== m.desde)) {
    await actualizar(sb, m.id, { inicial: false, desde: maxFecha || new Date().toISOString() });
  }
}
