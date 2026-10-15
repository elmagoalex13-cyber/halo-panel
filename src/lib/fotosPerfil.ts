// Foto de perfil y foto de banner de cada modelo (las sube ella desde su portal, tal cual, sin recomprimir). Van a R2 y aqui solo se guarda cual es la
// actual de cada una (panel_config, clave fotos_perfil:<modelo>, sin tabla nueva), con «comparar y cambiar» (updated_at).
import { createAdminClient } from "@/lib/supabase/server";
import { urlDescarga, urlVista } from "@/lib/r2/onlyfans";

export type TipoFotoPerfil = "perfil" | "banner";
export const TIPOS_FOTO_PERFIL: TipoFotoPerfil[] = ["perfil", "banner"];
export type FotoPerfil = { key: string; nombre: string; size: number; mime: string | null; at: string };
export type FotosPerfil = { perfil?: FotoPerfil; banner?: FotoPerfil };
export type FotoPerfilVista = { nombre: string; size: number; at: string; vista: string; descarga: string };

export const claveFotosPerfil = (modeloId: string) => `fotos_perfil:${modeloId}`;
export const prefijoFotosPerfil = (modeloId: string) => `onlyfans-perfil/${modeloId}/`;
export const esTipoFotoPerfil = (t: unknown): t is TipoFotoPerfil => t === "perfil" || t === "banner";
export const EXT_FOTO_PERFIL = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

export async function leerFotosPerfil(modeloId: string): Promise<FotosPerfil> {
  const { data } = await createAdminClient().from("panel_config").select("value").eq("key", claveFotosPerfil(modeloId)).maybeSingle();
  return ((data?.value as FotosPerfil | null) ?? {}) as FotosPerfil;
}

/** Apunta la foto nueva como la actual de ese tipo. */
export async function guardarFotoPerfil(modeloId: string, tipo: TipoFotoPerfil, foto: FotoPerfil): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("panel_config").select("value, updated_at").eq("key", claveFotosPerfil(modeloId)).maybeSingle();
    const nuevo = { ...((data?.value as FotosPerfil | null) ?? {}), [tipo]: foto };
    const ahora = new Date().toISOString();
    if (!data) {
      const { error } = await db.from("panel_config").insert({ key: claveFotosPerfil(modeloId), value: nuevo, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data: ok, error } = await db.from("panel_config").update({ value: nuevo, updated_at: ahora }).eq("key", claveFotosPerfil(modeloId)).eq("updated_at", data.updated_at).select("key");
      if (!error && ok?.length) return true;
    }
  }
  return false;
}

/** Enlaces temporales para ver y descargar las dos fotos. */
export async function vistasFotosPerfil(modeloId: string): Promise<Record<TipoFotoPerfil, FotoPerfilVista | null>> {
  const f = await leerFotosPerfil(modeloId).catch(() => ({}) as FotosPerfil);
  const una = async (tipo: TipoFotoPerfil): Promise<FotoPerfilVista | null> => {
    const x = f[tipo];
    if (!x) return null;
    try {
      const [vista, descarga] = await Promise.all([urlVista(x.key), urlDescarga(x.key, `${tipo === "perfil" ? "foto_perfil" : "banner"}_${x.nombre}`)]);
      return { nombre: x.nombre, size: x.size, at: x.at, vista, descarga };
    } catch {
      return null;
    }
  };
  const [perfil, banner] = await Promise.all([una("perfil"), una("banner")]);
  return { perfil, banner };
}
