import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { conCache, olvidarCache } from "@/lib/cacheCorta";

// Bucket PRIVADO de Supabase Storage con la foto de perfil de cada modelo (archivo = id de la modelo).
export const BUCKET_FOTOS = "fotos-modelos";

/** modelo_id -> marca de tiempo de su foto (para cachear por URL con ?v=). Vacio si aun no hay fotos. */
export async function versionesFotos(): Promise<Record<string, number>> {
  if (!canUseSupabase()) return {};
  // Casi cada pantalla la pide: se guarda un minuto (antes era una peticion a Supabase Storage por pantalla, de las lentas)
  return conCache("fotos-modelos", 60_000, async () => {
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
  });
}

/** Llamar al cambiar una foto de modelo para que se vea al momento. */
export const refrescarVersionesFotos = () => olvidarCache("fotos-modelos");
