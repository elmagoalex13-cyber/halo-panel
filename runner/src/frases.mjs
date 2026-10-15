import { frasesConAudio } from "./frases_referencia.mjs";
/**
 * Banco de frases (tabla banco_frases_canciones): elige la frase activa menos usada
 * (a igualdad, la de mayor puntuacion), la registra en banco_frases_usos y suma veces_usada.
 * Excluye las frases que ya se hayan asignado antes a esta misma pieza (banco_frases_usos),
 * para que un "rehacer con otra frase" no pueda repetir la que ya tenia.
 */
export async function asignarFrase(supabase, pieza) {
  const { data: usos } = await supabase
    .from("banco_frases_usos")
    .select("frase_id")
    .eq("pieza_id", pieza.id);
  const excluidas = [...new Set((usos ?? []).map((u) => u.frase_id).filter(Boolean))];

  // Se prefieren las frases que tienen MUSICA (la del video scrapeado de donde salieron): asi el video sale ya editado con la cancion.
  // Entre ellas, la menos usada y, a igualdad, la de mayor puntuacion.
  const conMusica = new Set(await frasesConAudio().catch(() => []));
  const { data: todas, error } = await supabase
    .from("banco_frases_canciones")
    .select("id, frase, cancion_nombre, cancion_artista, veces_usada, puntuacion, layout_json")
    .eq("activa", true);
  if (error || !todas?.length) return null;
  const orden = (a, b) => Number(conMusica.has(b.id)) - Number(conMusica.has(a.id)) || (a.veces_usada ?? 0) - (b.veces_usada ?? 0) || (b.puntuacion ?? 0) - (a.puntuacion ?? 0);
  // Si ya se han usado todas las frases activas en esta pieza (banco pequeno), no hay otra opcion que repetir
  // Todo video sale con musica: solo se usan las frases que la tienen (si por lo que sea no hubiera ninguna, se usan todas para no dejar de editar)
  const usables = todas.some((f) => conMusica.has(f.id)) ? todas.filter((f) => conMusica.has(f.id)) : todas;
  const candidatas = usables.filter((f) => !excluidas.includes(f.id));
  const elegida = [...(candidatas.length ? candidatas : usables)].sort(orden).slice(0, 1);
  if (!elegida.length) return null;

  const f = elegida[0];
  const notas = f.cancion_nombre && f.cancion_nombre !== "Sin cancion" ? `Audio sugerido: ${f.cancion_nombre}${f.cancion_artista ? " - " + f.cancion_artista : ""}` : null;
  await supabase
    .from("library_content")
    .update({ frase_quemada: f.frase, layout_json: f.layout_json ?? null, ...(notas ? { notas_editor: notas } : {}) })
    .eq("id", pieza.id);
  await supabase.from("banco_frases_canciones").update({ veces_usada: (f.veces_usada ?? 0) + 1 }).eq("id", f.id);
  await supabase.from("banco_frases_usos").insert({ frase_id: f.id, cuenta_id: pieza.cuenta_id ?? null, pieza_id: pieza.id });
  return { frase: f.frase, layout_json: f.layout_json ?? null };
}
