/**
 * Tipo 2 (frase con musica): TODOS los videos duran exactamente DURACION_TIPO2 segundos.
 *  - Original mas largo: se parte en varios fragmentos de 6 s (pueden solaparse, pero ninguno es
 *    identico a otro). El primero lo renderiza la propia pieza; el resto son piezas hermanas nuevas
 *    que comparten el mismo video original y reciben cada una su frase.
 *  - Original mas corto de 6 s: se repite en bucle hasta llegar a 6 s (lo hace renderTipo2).
 */
import { config } from "./config.mjs";

export const DURACION_TIPO2 = 6;

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Inicios (en segundos) de los fragmentos de 6 s de un original de `duracion` segundos.
 * n = round(duracion/6): 60 s -> 10 fragmentos exactos y seguidos; 20 s -> 3; 10 s -> 2 solapados.
 * Los inicios se reparten de forma uniforme de 0 a (duracion-6), asi el ultimo acaba justo al final.
 * Con tope (TIPO2_MAX_FRAGMENTOS) para que un original de varios minutos no genere decenas de piezas.
 */
export function planificarFragmentos(duracion, max = config.tipo2MaxFragmentos) {
  if (!Number.isFinite(duracion) || duracion <= DURACION_TIPO2 + 0.25) return [0];
  const n = Math.max(1, Math.min(max, Math.round(duracion / DURACION_TIPO2)));
  if (n === 1) return [0];
  const ultimo = duracion - DURACION_TIPO2;
  return Array.from({ length: n }, (_, i) => r2((ultimo * i) / (n - 1)));
}

/**
 * Reparte `pieza` en fragmentos: guarda el recorte del primero en la propia pieza y crea una pieza
 * hermana por cada fragmento restante (frase vacia: el runner le asignara una distinta).
 * Si algo falla a medias se deshacen las hermanas creadas, para no dejar duplicados al reintentar.
 */
export async function dividirEnFragmentos(supabase, pieza, rawKey, inicios) {
  const { data: base, error: errLeer } = await supabase.from("library_content").select("*").eq("id", pieza.id).single();
  if (errLeer || !base) throw new Error(`No se pudo leer la pieza para dividirla: ${errLeer?.message ?? "no existe"}`);

  const total = inicios.length;
  const titulo = base.titulo ?? "Video de la modelo";
  const hermanas = inicios.slice(1).map((inicio, i) => ({
    modelo_id: base.modelo_id,
    cuenta_id: base.cuenta_id,
    origen: base.origen,
    r2_bucket: base.r2_bucket,
    r2_key: base.r2_key,
    r2_key_original: base.r2_key_original ?? rawKey,
    r2_key_referencia: base.r2_key_referencia,
    audio_referencia_url: base.audio_referencia_url,
    filename_original: base.filename_original,
    mimetype: base.mimetype,
    size_bytes: base.size_bytes,
    duracion_seg: base.duracion_seg,
    tipo: base.tipo,
    tipo_video: base.tipo_video,
    titulo: `${titulo} · parte ${i + 2}/${total}`,
    notas_editor: base.notas_editor,
    recibido_at: base.recibido_at,
    reparto_at: base.reparto_at,
    estado: "editando",
    estado_procesamiento: "pendiente",
    recorte_inicio: inicio,
    recorte_fin: r2(inicio + DURACION_TIPO2),
    frase_quemada: "",
    layout_json: null,
    caption: "",
    correcciones: "",
  }));

  const { data: creadas, error: errCrear } = await supabase.from("library_content").insert(hermanas).select("id");
  if (errCrear) throw new Error(`No se pudieron crear los fragmentos: ${errCrear.message}`);

  const { error: errParte } = await supabase
    .from("library_content")
    .update({ recorte_inicio: inicios[0], recorte_fin: r2(inicios[0] + DURACION_TIPO2) })
    .eq("id", pieza.id);
  if (errParte) {
    await supabase.from("library_content").delete().in("id", (creadas ?? []).map((c) => c.id));
    throw new Error(`No se pudo guardar el recorte del primer fragmento: ${errParte.message}`);
  }
  console.log(`[runner] pieza ${pieza.id}: original dividido en ${total} fragmentos de ${DURACION_TIPO2}s (inicios ${inicios.join(", ")})`);
  return creadas ?? [];
}
