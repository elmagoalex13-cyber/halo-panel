import { listarClavesR2 } from "@/lib/r2";
import { conCache } from "@/lib/cacheCorta";

/** Hashes de los originales que ya tienen vista previa (previews/<hash>.mp4). Listar R2 cuesta casi un segundo, asi que se guarda un minuto. */
export function hashesPreviewsListos(): Promise<Set<string>> {
  return conCache("previews-listas", 60_000, async () => {
    try {
      return new Set((await listarClavesR2("previews/", 50000)).filter((k) => k.endsWith(".mp4")).map((k) => k.slice("previews/".length, -4)));
    } catch {
      return new Set<string>(); // sin R2: se ensena sin vista previa (y no se guarda el fallo: se reintenta enseguida)
    }
  });
}
