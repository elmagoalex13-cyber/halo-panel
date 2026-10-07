// Errores de Supabase/Postgres convertidos en un mensaje que se entiende (y el codigo HTTP que toca).
// OJO: los errores de Supabase no son `instanceof Error`, por eso antes se perdian y la pantalla "no hacia nada".

export function errorDb(error: unknown, porDefecto = "No se pudo guardar"): { mensaje: string; estado: number } {
  const e = error as { code?: string; message?: string; details?: string } | null;
  const texto = `${e?.message ?? ""} ${e?.details ?? ""}`;
  if (e?.code === "23505" || /duplicate key|unique constraint/i.test(texto)) {
    if (/email/i.test(texto)) return { mensaje: "Ya existe una modelo con ese email. Usa otro, o déjalo en blanco.", estado: 409 };
    if (/portal_token/i.test(texto)) return { mensaje: "Ese enlace de portal ya está en uso.", estado: 409 };
    return { mensaje: "Ya existe un registro con esos datos.", estado: 409 };
  }
  if (e?.code === "23502") return { mensaje: "Falta un dato obligatorio.", estado: 400 };
  if (e?.code === "22P02" || e?.code === "22001") return { mensaje: "Hay un dato con un formato no válido.", estado: 400 };
  return { mensaje: e?.message || porDefecto, estado: 500 };
}
