import type { SupabaseClient } from "@supabase/supabase-js";

/** La BD exige cancion_nombre; las frases sin cancion usan este valor. */
export const SIN_CANCION = "Sin cancion";

export type FraseElegida = { id: string; frase: string; nota: string | null; layout_json: unknown | null };

/** Frase activa menos usada del banco (a igualdad, la de mayor puntuacion). */
export async function elegirFrase(supabase: SupabaseClient): Promise<FraseElegida | null> {
  // Se prefieren las frases que tienen MUSICA (el editor mantiene la lista en panel_config.frases_con_audio): el video sale con la cancion
  const [{ data, error }, { data: lista }] = await Promise.all([
    supabase.from("banco_frases_canciones").select("id, frase, cancion_nombre, cancion_artista, layout_json, veces_usada, puntuacion").eq("activa", true),
    supabase.from("panel_config").select("value").eq("key", "frases_con_audio").maybeSingle(),
  ]);
  if (error || !data?.length) return null;
  const conMusica = new Set(((lista?.value as { ids?: string[] } | null)?.ids ?? []) as string[]);
  const filas = data as Array<{ id: string; frase: string; cancion_nombre: string | null; cancion_artista: string | null; layout_json: unknown | null; veces_usada: number | null; puntuacion: number | null }>;
  // Todo video sale con musica: solo se usan las frases que la tienen (si no hubiera ninguna, todas, para no dejar de asignar)
  const usables = filas.some((x) => conMusica.has(x.id)) ? filas.filter((x) => conMusica.has(x.id)) : filas;
  usables.sort((x, y) => (x.veces_usada ?? 0) - (y.veces_usada ?? 0) || (y.puntuacion ?? 0) - (x.puntuacion ?? 0));
  const f = usables[0];
  const nota = f.cancion_nombre && f.cancion_nombre !== SIN_CANCION ? `Audio sugerido: ${f.cancion_nombre}${f.cancion_artista ? " - " + f.cancion_artista : ""}` : null;
  return { id: f.id, frase: f.frase, nota, layout_json: f.layout_json ?? null };
}

export async function registrarUsoFrase(supabase: SupabaseClient, fraseId: string, piezaId: string, cuentaId: string | null) {
  const { data } = await supabase.from("banco_frases_canciones").select("veces_usada").eq("id", fraseId).single();
  await supabase
    .from("banco_frases_canciones")
    .update({ veces_usada: ((data?.veces_usada as number | null) ?? 0) + 1 })
    .eq("id", fraseId);
  await supabase.from("banco_frases_usos").insert({ frase_id: fraseId, cuenta_id: cuentaId, pieza_id: piezaId });
}
