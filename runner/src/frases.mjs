/**
 * Banco de frases (tabla banco_frases_canciones): elige la frase activa menos usada
 * (a igualdad, la de mayor puntuacion), la registra en banco_frases_usos y suma veces_usada.
 */
export async function asignarFrase(supabase, pieza) {
  const { data, error } = await supabase
    .from("banco_frases_canciones")
    .select("id, frase, cancion_nombre, cancion_artista, veces_usada, puntuacion")
    .eq("activa", true)
    .order("veces_usada", { ascending: true })
    .order("puntuacion", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;

  const f = data[0];
  const notas = f.cancion_nombre ? `Audio sugerido: ${f.cancion_nombre}${f.cancion_artista ? " - " + f.cancion_artista : ""}` : null;
  await supabase
    .from("library_content")
    .update({ frase_quemada: f.frase, ...(notas ? { notas_editor: notas } : {}) })
    .eq("id", pieza.id);
  await supabase.from("banco_frases_canciones").update({ veces_usada: (f.veces_usada ?? 0) + 1 }).eq("id", f.id);
  await supabase.from("banco_frases_usos").insert({ frase_id: f.id, cuenta_id: pieza.cuenta_id ?? null, pieza_id: pieza.id });
  return f.frase;
}
