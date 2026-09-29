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

  let query = supabase
    .from("banco_frases_canciones")
    .select("id, frase, cancion_nombre, cancion_artista, veces_usada, puntuacion, layout_json")
    .eq("activa", true);
  if (excluidas.length) query = query.not("id", "in", `(${excluidas.join(",")})`);
  const { data, error } = await query
    .order("veces_usada", { ascending: true })
    .order("puntuacion", { ascending: false })
    .limit(1);
  if (error) return null;

  // Si ya se han usado todas las frases activas en esta pieza (banco pequeno), no hay
  // otra opcion que repetir: se vuelve a consultar sin exclusion en vez de fallar.
  let elegida = data;
  if (!elegida?.length && excluidas.length) {
    const { data: fallback, error: errFallback } = await supabase
      .from("banco_frases_canciones")
      .select("id, frase, cancion_nombre, cancion_artista, veces_usada, puntuacion, layout_json")
      .eq("activa", true)
      .order("veces_usada", { ascending: true })
      .order("puntuacion", { ascending: false })
      .limit(1);
    if (errFallback || !fallback?.length) return null;
    elegida = fallback;
  }
  if (!elegida?.length) return null;

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
