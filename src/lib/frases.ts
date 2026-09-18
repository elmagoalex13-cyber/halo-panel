import type { SupabaseClient } from "@supabase/supabase-js";

export type FraseElegida = { id: string; frase: string; nota: string | null };

/** Frase activa menos usada del banco (a igualdad, la de mayor puntuacion). */
export async function elegirFrase(supabase: SupabaseClient): Promise<FraseElegida | null> {
  const { data, error } = await supabase
    .from("banco_frases_canciones")
    .select("id, frase, cancion_nombre, cancion_artista")
    .eq("activa", true)
    .order("veces_usada", { ascending: true })
    .order("puntuacion", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const f = data[0] as { id: string; frase: string; cancion_nombre: string | null; cancion_artista: string | null };
  const nota = f.cancion_nombre ? `Audio sugerido: ${f.cancion_nombre}${f.cancion_artista ? " - " + f.cancion_artista : ""}` : null;
  return { id: f.id, frase: f.frase, nota };
}

export async function registrarUsoFrase(supabase: SupabaseClient, fraseId: string, piezaId: string, cuentaId: string | null) {
  const { data } = await supabase.from("banco_frases_canciones").select("veces_usada").eq("id", fraseId).single();
  await supabase
    .from("banco_frases_canciones")
    .update({ veces_usada: ((data?.veces_usada as number | null) ?? 0) + 1 })
    .eq("id", fraseId);
  await supabase.from("banco_frases_usos").insert({ frase_id: fraseId, cuenta_id: cuentaId, pieza_id: piezaId });
}
