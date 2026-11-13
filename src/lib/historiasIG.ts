import { listarObjetosOF, urlDescarga, urlVista } from "@/lib/r2/onlyfans";

// Fotos de historias de Instagram que sube la modelo desde su portal. Viven en R2 bajo historias/<modelo>/<archivo>
// (sin tabla): la carpeta ES el registro. Se ven y se descargan con enlaces temporales.
export const prefijoHistorias = (modeloId: string) => `historias/${modeloId}/`;
export const MAX_HISTORIAS = 300; // por modelo: evita que una carpeta crezca sin control
export const TAM_MAX_HISTORIA = 40 * 1024 * 1024;

export type Historia = { key: string; nombre: string; size: number; fecha: string | null; mini: string; vista: string; descarga: string; enPost?: boolean };

// Las miniaturas (<clave>.thumb.jpg) viven junto a las originales pero no son historias: nunca se cuentan ni se listan
export const esMiniatura = (key: string) => key.endsWith(".thumb.jpg");

/** conPanel: el panel de la agencia las ve a traves del propio servidor (miniatura pequena); el portal de la modelo usa enlaces directos como siempre. */
export async function listarHistorias(modeloId: string, conPanel = false): Promise<Historia[]> {
  const objetos = (await listarObjetosOF(prefijoHistorias(modeloId), 2 * MAX_HISTORIAS + 100)).filter((o) => !esMiniatura(o.key));
  objetos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const lista = objetos.slice(0, MAX_HISTORIAS);
  if (conPanel) {
    // Panel: no van directas a R2 (desde algunas redes no responde y 300 originales colgaban la pantalla) sino por el servidor
    const url = (key: string, modo: string) => `/api/instagram/historias/imagen?modelo=${modeloId}&key=${encodeURIComponent(key)}&modo=${modo}`;
    return lista.map((o) => ({ key: o.key, nombre: o.key.split("/").pop() ?? "historia.jpg", size: o.size, fecha: o.fecha, mini: url(o.key, "mini"), vista: url(o.key, "full"), descarga: url(o.key, "descarga") }));
  }
  return Promise.all(
    lista.map(async (o) => {
      const nombre = o.key.split("/").pop() ?? "historia.jpg";
      const vista = await urlVista(o.key);
      return { key: o.key, nombre, size: o.size, fecha: o.fecha, mini: vista, vista, descarga: await urlDescarga(o.key, nombre) };
    }),
  );
}

// ---- Resumen para el panel (menu lateral y apartado Instagram > Historias) ----
// Se lista la carpeta historias/ una sola vez (se guarda 20 s en memoria para que el menu, que se refresca cada 30 s, no
// dispare una peticion a R2 por cada pestana abierta) y se agrupa por modelo. "Nuevas" = subidas despues de la ultima
// vez que ESA persona abrio las historias de esa modelo (cada usuario del panel tiene su propio "visto").
import { createAdminClient } from "@/lib/supabase/server";
import { veModelo, type Alcance } from "@/lib/alcance";

export type ResumenHistoria = { modeloId: string; total: number; nuevas: number; ultima: string | null };

let cacheObjetos: { at: number; objetos: Array<{ key: string; size: number; fecha: string | null }> } | null = null;
export const invalidarHistorias = () => {
  cacheObjetos = null;
};

async function objetosHistorias() {
  if (cacheObjetos && Date.now() - cacheObjetos.at < 90000) return cacheObjetos.objetos;
  const objetos = (await listarObjetosOF("historias/", 50000)).filter((o) => !esMiniatura(o.key));
  cacheObjetos = { at: Date.now(), objetos };
  return objetos;
}

const claveVistas = (usuario: string) => `historias_vistas:${usuario}`;

async function leerVistas(usuario: string): Promise<Record<string, string>> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", claveVistas(usuario)).maybeSingle();
    return (data?.value as Record<string, string> | undefined) ?? {};
  } catch {
    return {};
  }
}

/** Marca como vistas las historias de una modelo hasta la fecha indicada (la de la ultima foto que se ha mostrado). */
export async function marcarHistoriasVistas(usuario: string, modeloId: string, hasta: string) {
  const vistas = await leerVistas(usuario);
  if (vistas[modeloId] && vistas[modeloId] >= hasta) return;
  vistas[modeloId] = hasta;
  await createAdminClient().from("panel_config").upsert({ key: claveVistas(usuario), value: vistas, updated_at: new Date().toISOString() });
}

export async function resumenHistorias(alcance: Alcance, usuario: string): Promise<ResumenHistoria[]> {
  const [objetos, vistas] = await Promise.all([objetosHistorias(), leerVistas(usuario)]);
  const porModelo = new Map<string, ResumenHistoria>();
  for (const o of objetos) {
    const modeloId = o.key.split("/")[1];
    if (!modeloId || !veModelo(alcance, modeloId) || alcance.excluir?.includes(modeloId)) continue;
    const r = porModelo.get(modeloId) ?? { modeloId, total: 0, nuevas: 0, ultima: null };
    r.total++;
    if (!vistas[modeloId] || (o.fecha ?? "") > vistas[modeloId]) r.nuevas++;
    if (o.fecha && (!r.ultima || o.fecha > r.ultima)) r.ultima = o.fecha;
    porModelo.set(modeloId, r);
  }
  return [...porModelo.values()];
}
