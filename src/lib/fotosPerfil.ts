// Foto de perfil y foto de banner de cada modelo (las sube ella desde su portal, tal cual, sin recomprimir). Van a R2 y aqui se guardan TODAS las opciones que ha
// subido de cada una (panel_config, clave fotos_perfil:<modelo>, sin tabla nueva), con «comparar y cambiar» (updated_at): la mas reciente primero.
// La agencia las marca como publicadas, las elimina o le pide a la modelo que suba otra (con un motivo opcional que ella ve en su portal).
import { createAdminClient } from "@/lib/supabase/server";
import { borrarObjetoOF, urlDescarga, urlVista } from "@/lib/r2/onlyfans";

export type TipoFotoPerfil = "perfil" | "banner";
export const TIPOS_FOTO_PERFIL: TipoFotoPerfil[] = ["perfil", "banner"];
export type FotoPerfil = { key: string; nombre: string; size: number; mime: string | null; at: string; publicada_at?: string; publicada_por?: string };
export type PedirFoto = { motivo: string | null; at: string; por: string };
// perfil / banner (una sola foto) es el formato de antes; ahora se guardan en perfiles / banners (todas las opciones subidas)
export type FotosPerfil = { perfil?: FotoPerfil; banner?: FotoPerfil; perfiles?: FotoPerfil[]; banners?: FotoPerfil[]; pedir?: { perfil?: PedirFoto; banner?: PedirFoto } };
export type FotoPerfilVista = { key: string; nombre: string; size: number; at: string; vista: string; descarga: string; publicada_at: string | null; publicada_por: string | null };
export type FotosPerfilVistas = {
  perfil: FotoPerfilVista | null; // la mas reciente
  banner: FotoPerfilVista | null;
  perfilOpciones: FotoPerfilVista[]; // todas las que ha subido (la mas reciente primero)
  bannerOpciones: FotoPerfilVista[];
  pedir: { perfil: PedirFoto | null; banner: PedirFoto | null };
};

export const claveFotosPerfil = (modeloId: string) => `fotos_perfil:${modeloId}`;
export const prefijoFotosPerfil = (modeloId: string) => `onlyfans-perfil/${modeloId}/`;
export const esTipoFotoPerfil = (t: unknown): t is TipoFotoPerfil => t === "perfil" || t === "banner";
export const EXT_FOTO_PERFIL = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const MAX_OPCIONES = 10; // las mas antiguas se van borrando al pasar de aqui

const lista = (v: FotosPerfil, tipo: TipoFotoPerfil): FotoPerfil[] => {
  const arr = tipo === "perfil" ? v.perfiles : v.banners;
  if (arr) return arr;
  const uno = v[tipo];
  return uno ? [uno] : [];
};
/** Mismo registro con las dos listas ya en el formato nuevo (y sin los campos antiguos). */
const normal = (v: FotosPerfil, perfiles = lista(v, "perfil"), banners = lista(v, "banner")): FotosPerfil => ({ perfiles, banners, pedir: { ...(v.pedir ?? {}) } });
const conLista = (v: FotosPerfil, tipo: TipoFotoPerfil, nueva: FotoPerfil[]): FotosPerfil => (tipo === "perfil" ? normal(v, nueva, lista(v, "banner")) : normal(v, lista(v, "perfil"), nueva));

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

/** Añade la foto nueva como una opcion MAS de ese tipo (la mas reciente queda la primera) y quita el «sube otra» pendiente de ese tipo. */
export async function guardarFotoPerfil(modeloId: string, tipo: TipoFotoPerfil, foto: FotoPerfil): Promise<boolean> {
  let sobrantes: FotoPerfil[] = [];
  const ok = await cambiarFotosPerfil(modeloId, (v) => {
    const todas = [foto, ...lista(v, tipo).filter((f) => f.key !== foto.key)];
    sobrantes = todas.slice(MAX_OPCIONES);
    const n = conLista(v, tipo, todas.slice(0, MAX_OPCIONES));
    delete n.pedir![tipo];
    return n;
  });
  if (ok) await Promise.all(sobrantes.filter((f) => f.key.startsWith("onlyfans-perfil/")).map((f) => borrarObjetoOF(f.key).catch(() => undefined)));
  return ok;
}

/** Quita una opcion (la de esa `key`, o todas las de ese tipo si no se dice): borra el archivo y el registro. Con `pedir`, deja anotado que la modelo tiene que subir otra (y el motivo). */
export async function quitarFotoPerfil(modeloId: string, tipo: TipoFotoPerfil, pedir?: { motivo: string | null; por: string }, key?: string): Promise<boolean> {
  let quitadas: FotoPerfil[] = [];
  const ok = await cambiarFotosPerfil(modeloId, (v) => {
    const todas = lista(v, tipo);
    quitadas = key ? todas.filter((f) => f.key === key) : todas;
    const n = conLista(v, tipo, key ? todas.filter((f) => f.key !== key) : []);
    if (pedir) n.pedir![tipo] = { motivo: pedir.motivo, at: new Date().toISOString(), por: pedir.por };
    else delete n.pedir![tipo];
    return n;
  });
  if (ok) await Promise.all(quitadas.filter((f) => f.key.startsWith(prefijoFotosPerfil(modeloId))).map((f) => borrarObjetoOF(f.key).catch(() => undefined)));
  return ok;
}

/** Marca (o desmarca) una opcion como publicada en OnlyFans (la de esa `key`, o la mas reciente si no se dice). */
export async function marcarFotoPublicada(modeloId: string, tipo: TipoFotoPerfil, publicada: boolean, por: string, key?: string): Promise<boolean> {
  return cambiarFotosPerfil(modeloId, (v) => {
    const todas = lista(v, tipo);
    const i = key ? todas.findIndex((f) => f.key === key) : 0;
    if (i < 0 || !todas[i]) return null;
    const nueva: FotoPerfil = { ...todas[i] };
    if (publicada) {
      nueva.publicada_at = new Date().toISOString();
      nueva.publicada_por = por;
    } else {
      delete nueva.publicada_at;
      delete nueva.publicada_por;
    }
    return conLista(v, tipo, todas.map((f, j) => (j === i ? nueva : f)));
  });
}

async function vistaDe(tipo: TipoFotoPerfil, x: FotoPerfil): Promise<FotoPerfilVista | null> {
  try {
    const [vista, descarga] = await Promise.all([urlVista(x.key), urlDescarga(x.key, `${tipo === "perfil" ? "foto_perfil" : "banner"}_${x.nombre}`)]);
    return { key: x.key, nombre: x.nombre, size: x.size, at: x.at, vista, descarga, publicada_at: x.publicada_at ?? null, publicada_por: x.publicada_por ?? null };
  } catch {
    return null;
  }
}

async function vistasDe(v: FotosPerfil): Promise<FotosPerfilVistas> {
  const [p, b] = await Promise.all([
    Promise.all(lista(v, "perfil").map((x) => vistaDe("perfil", x))),
    Promise.all(lista(v, "banner").map((x) => vistaDe("banner", x))),
  ]);
  const perfilOpciones = p.filter((x): x is FotoPerfilVista => Boolean(x));
  const bannerOpciones = b.filter((x): x is FotoPerfilVista => Boolean(x));
  return { perfil: perfilOpciones[0] ?? null, banner: bannerOpciones[0] ?? null, perfilOpciones, bannerOpciones, pedir: { perfil: v.pedir?.perfil ?? null, banner: v.pedir?.banner ?? null } };
}

/** Enlaces temporales para ver y descargar las fotos de una modelo. */
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
