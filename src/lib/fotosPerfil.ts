// Foto de perfil y foto de banner de cada modelo (las sube ella desde su portal, tal cual, sin recomprimir). Van a R2 y aqui solo se guarda cual es la
// actual de cada una (panel_config, clave fotos_perfil:<modelo>, sin tabla nueva), con «comparar y cambiar» (updated_at).
// La agencia las marca como publicadas, las elimina o le pide a la modelo que la suba de nuevo (con un motivo opcional que ella ve en su portal).
import { createAdminClient } from "@/lib/supabase/server";
import { borrarObjetoOF, urlDescarga, urlVista } from "@/lib/r2/onlyfans";

export type TipoFotoPerfil = "perfil" | "banner";
export const TIPOS_FOTO_PERFIL: TipoFotoPerfil[] = ["perfil", "banner"];
export type FotoPerfil = { key: string; nombre: string; size: number; mime: string | null; at: string; publicada_at?: string; publicada_por?: string };
export type PedirFoto = { motivo: string | null; at: string; por: string };
export type FotosPerfil = { perfil?: FotoPerfil; banner?: FotoPerfil; pedir?: { perfil?: PedirFoto; banner?: PedirFoto } };
export type FotoPerfilVista = { nombre: string; size: number; at: string; vista: string; descarga: string; publicada_at: string | null; publicada_por: string | null };
export type FotosPerfilVistas = { perfil: FotoPerfilVista | null; banner: FotoPerfilVista | null; pedir: { perfil: PedirFoto | null; banner: PedirFoto | null } };

export const claveFotosPerfil = (modeloId: string) => `fotos_perfil:${modeloId}`;
export const prefijoFotosPerfil = (modeloId: string) => `onlyfans-perfil/${modeloId}/`;
export const esTipoFotoPerfil = (t: unknown): t is TipoFotoPerfil => t === "perfil" || t === "banner";
export const EXT_FOTO_PERFIL = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

export async function leerFotosPerfil(modeloId: string): Promise<FotosPerfil> {
  const { data } = await createAdminClient().from("panel_config").select("value").eq("key", claveFotosPerfil(modeloId)).maybeSingle();
  return ((data?.value as FotosPerfil | null) ?? {}) as FotosPerfil;
}

/** Aplica un cambio al registro de la modelo con «comparar y cambiar»; si fn devuelve null no hay nada que cambiar. */
export async function cambiarFotosPerfil(modeloId: string, fn: (actual: FotosPerfil) => FotosPerfil | null): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("panel_config").select("value, updated_at").eq("key", claveFotosPerfil(modeloId)).maybeSingle();
    const nuevo = fn(((data?.value as FotosPerfil | null) ?? {}) as FotosPerfil);
    if (nuevo === null) return true;
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

/** Apunta la foto nueva como la actual de ese tipo (y quita el «sube otra» pendiente de ese tipo). */
export async function guardarFotoPerfil(modeloId: string, tipo: TipoFotoPerfil, foto: FotoPerfil): Promise<boolean> {
  return cambiarFotosPerfil(modeloId, (v) => {
    const pedir = { ...(v.pedir ?? {}) };
    delete pedir[tipo];
    return { ...v, [tipo]: foto, pedir };
  });
}

/** Quita la foto: borra el archivo y el registro. Con `pedir`, deja anotado que la modelo tiene que subirla de nuevo (y el motivo). */
export async function quitarFotoPerfil(modeloId: string, tipo: TipoFotoPerfil, pedir?: { motivo: string | null; por: string }): Promise<boolean> {
  const antes = (await leerFotosPerfil(modeloId))[tipo];
  const ok = await cambiarFotosPerfil(modeloId, (v) => {
    const nuevo: FotosPerfil = { ...v, pedir: { ...(v.pedir ?? {}) } };
    delete nuevo[tipo];
    if (pedir) nuevo.pedir![tipo] = { motivo: pedir.motivo, at: new Date().toISOString(), por: pedir.por };
    else delete nuevo.pedir![tipo];
    return nuevo;
  });
  if (ok && antes?.key && antes.key.startsWith(prefijoFotosPerfil(modeloId))) await borrarObjetoOF(antes.key).catch(() => undefined);
  return ok;
}

/** Marca (o desmarca) la foto como publicada en OnlyFans. */
export async function marcarFotoPublicada(modeloId: string, tipo: TipoFotoPerfil, publicada: boolean, por: string): Promise<boolean> {
  return cambiarFotosPerfil(modeloId, (v) => {
    const f = v[tipo];
    if (!f) return null;
    const nueva: FotoPerfil = { ...f };
    if (publicada) {
      nueva.publicada_at = new Date().toISOString();
      nueva.publicada_por = por;
    } else {
      delete nueva.publicada_at;
      delete nueva.publicada_por;
    }
    return { ...v, [tipo]: nueva };
  });
}

async function vistaDe(tipo: TipoFotoPerfil, v: FotosPerfil): Promise<FotoPerfilVista | null> {
  const x = v[tipo];
  if (!x) return null;
  try {
    const [vista, descarga] = await Promise.all([urlVista(x.key), urlDescarga(x.key, `${tipo === "perfil" ? "foto_perfil" : "banner"}_${x.nombre}`)]);
    return { nombre: x.nombre, size: x.size, at: x.at, vista, descarga, publicada_at: x.publicada_at ?? null, publicada_por: x.publicada_por ?? null };
  } catch {
    return null;
  }
}

async function vistasDe(v: FotosPerfil): Promise<FotosPerfilVistas> {
  const [perfil, banner] = await Promise.all([vistaDe("perfil", v), vistaDe("banner", v)]);
  return { perfil, banner, pedir: { perfil: v.pedir?.perfil ?? null, banner: v.pedir?.banner ?? null } };
}

/** Enlaces temporales para ver y descargar las dos fotos de una modelo. */
export async function vistasFotosPerfil(modeloId: string): Promise<FotosPerfilVistas> {
  return vistasDe(await leerFotosPerfil(modeloId).catch(() => ({}) as FotosPerfil));
}

/** Las fotos de varias modelos de una vez (una sola consulta). */
export async function vistasFotosPerfilDe(ids: string[]): Promise<Record<string, FotosPerfilVistas>> {
  const salida: Record<string, FotosPerfilVistas> = {};
  if (!ids.length) return salida;
  try {
    const { data } = await createAdminClient().from("panel_config").select("key, value").in("key", ids.map(claveFotosPerfil));
    await Promise.all((data ?? []).map(async (f) => void (salida[String(f.key).slice("fotos_perfil:".length)] = await vistasDe((f.value as FotosPerfil | null) ?? {}))));
  } catch {
    /* sin fotos: la pestaña sale vacia */
  }
  return salida;
}
