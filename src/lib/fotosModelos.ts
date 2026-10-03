import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// Bucket PRIVADO de Supabase Storage con la foto de perfil de cada modelo (archivo = id de la modelo).
export const BUCKET_FOTOS = "fotos-modelos";

/** modelo_id -> marca de tiempo de su foto (para cachear por URL con ?v=). Vacio si aun no hay fotos. */
export async function versionesFotos(): Promise<Record<string, number>> {
  if (!canUseSupabase()) return {};
  try {
    const { data } = await createAdminClient().storage.from(BUCKET_FOTOS).list("", { limit: 1000 });
    return Object.fromEntries(
      (data ?? [])
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => [f.name, Date.parse(f.updated_at ?? f.created_at ?? "") || 1]),
    );
  } catch {
    return {};
  }
}
