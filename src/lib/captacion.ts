import { createAdminClient } from "@/lib/supabase/server";
import { soloVisibles, type Alcance } from "@/lib/alcance";
import { NOMBRE_HISTORIAS_POSTS } from "@/lib/onlyfans";
import { encolarTelegram } from "@/lib/telegramCola";

// Fase de CAPTACION: una modelo con objetivos debe entregar, antes de crearle la cuenta de Instagram:
//   - reels (objetivo_videos, p. ej. 30): se quedan EN ESPERA (estado "recibido") hasta que la agencia los manda a editar
//   - scripts completos y APROBADOS por la agencia (objetivo_scripts, p. ej. 4)
//   - packs de fotos entregados (objetivo_packs, p. ej. 5)
//   - posts de OnlyFans subidos (objetivo_posts, p. ej. 30): todos van a una misma carpeta y cada foto/vídeo cuenta como un post
// Un objetivo en blanco (null) significa que no se exige. Cuando se cumplen todos, se avisa de que hay que crearle la cuenta.

export const OBJETIVO_POR_DEFECTO = 30;
export const OBJETIVOS_OF_POR_DEFECTO = { scripts: 4, packs: 5, posts: 30 } as const;

export type Meta = { n: number; obj: number | null };
export type ProgresoCaptacion = {
  reels: Meta;
  scripts: Meta; // solo cuentan los aprobados por la agencia
  scriptsEntregados: number; // entregados (aunque aun no aprobados)
  packs: Meta;
  posts: Meta;
  cumplido: boolean; // todos los objetivos exigidos estan cumplidos
};

const cumple = (m: Meta) => m.obj === null || m.n >= m.obj;
const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);

/** Posts de OnlyFans de una modelo: cada archivo subido a sus carpetas de posts (la carpeta unica y, si los tiene, los posts sueltos de antes). */
export async function contarPosts(db: ReturnType<typeof createAdminClient>, modeloId: string): Promise<number> {
  const { data } = await db.from("of_colecciones").select("id").eq("modelo_id", modeloId).eq("tipo", "post").neq("nombre", NOMBRE_HISTORIAS_POSTS);
  const ids = (data ?? []).map((c) => c.id as string);
  if (!ids.length) return 0;
  const { count } = await db.from("of_archivos").select("id", { count: "exact", head: true }).in("coleccion_id", ids);
  return count ?? 0;
}

/** Progreso de una modelo en todos sus objetivos. null si no tiene captacion. Tolerante a que falten SQL por ejecutar. */
export async function progresoCaptacion(modeloId: string): Promise<ProgresoCaptacion | null> {
  try {
    const db = createAdminClient();
    let m = await db.from("modelos").select("objetivo_videos, objetivo_scripts, objetivo_packs, objetivo_posts").eq("id", modeloId).maybeSingle();
    if (m.error) m = (await db.from("modelos").select("objetivo_videos").eq("id", modeloId).maybeSingle()) as typeof m;
    const f = (m.data ?? null) as Record<string, unknown> | null;
    if (!f || !num(f.objetivo_videos)) return null;

    const entregadas = (tipo: string) => db.from("of_colecciones").select("id", { count: "exact", head: true }).eq("modelo_id", modeloId).eq("tipo", tipo).eq("estado", "entregado");
    const [reels, scriptsEnt, packs, posts] = await Promise.all([
      db.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", modeloId).eq("origen", "upload_manual").or("tipo.is.null,tipo.not.in.(3,5)"), // los TikTok no son reels: se acumulan en espera pero no cuentan para el objetivo
      entregadas("script"),
      entregadas("pack"),
      contarPosts(db, modeloId),
    ]);
    // Scripts aprobados (si aun no existe la columna de revision, se cuentan los entregados)
    const aprobados = await db.from("of_colecciones").select("id", { count: "exact", head: true }).eq("modelo_id", modeloId).eq("tipo", "script").eq("estado", "entregado").eq("revision", "aprobado");
    const scriptsN = aprobados.error ? (scriptsEnt.count ?? 0) : (aprobados.count ?? 0);

    const p: ProgresoCaptacion = {
      reels: { n: reels.count ?? 0, obj: num(f.objetivo_videos) },
      scripts: { n: scriptsN, obj: num(f.objetivo_scripts) },
      scriptsEntregados: scriptsEnt.count ?? 0,
      packs: { n: packs.count ?? 0, obj: num(f.objetivo_packs) },
      posts: { n: posts, obj: num(f.objetivo_posts) },
      cumplido: false,
    };
    p.cumplido = cumple(p.reels) && cumple(p.scripts) && cumple(p.packs) && cumple(p.posts);
    return p;
  } catch {
    return null;
  }
}

const CLAVE_LISTAS = "captacion_listas"; // { ids: [modelos que cumplen todo y aun no tienen cuenta de Instagram], at }
const CLAVE_RECORDATORIOS = "captacion_recordatorios"; // { [modeloId]: ultima vez que se les recordo por Telegram }
const RECORDATORIO_MS = 24 * 3600000; // mientras siga sin cuenta, un recordatorio al dia

/** Modelos que cumplen TODO y aun no tienen cuenta de Instagram (la lista que enseña la barra lateral); se actualiza con cada barrido y cada vez que alguien cumple. */
export async function leerListasParaCuenta(): Promise<string[]> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", CLAVE_LISTAS).maybeSingle();
    const ids = (data?.value as { ids?: unknown } | null)?.ids;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function guardarListas(cambio: (ids: string[]) => string[]): Promise<void> {
  const db = createAdminClient();
  const ids = cambio(await leerListasParaCuenta());
  await db.from("panel_config").upsert({ key: CLAVE_LISTAS, value: { ids: [...new Set(ids)], at: new Date().toISOString() }, updated_at: new Date().toISOString() });
}

/**
 * Barrido (lo llama el editor cada 10 minutos): mira TODAS las modelos con captacion y, por cada una que ya cumple todos los minimos y aun no tiene cuenta de
 * Instagram, avisa por Telegram (la primera vez y despues un recordatorio al dia hasta que se le cree la cuenta). Asi el aviso nunca depende de una accion
 * concreta (subir, aprobar...) ni se queda perdido en el chat.
 */
export async function barridoUmbral(): Promise<{ listas: number; avisos: number }> {
  const db = createAdminClient();
  const { data: modelos } = await db.from("modelos").select("id, nombre, umbral_avisado_at").not("objetivo_videos", "is", null).eq("activa", true).is("eliminada_at", null);
  const { data: cuentas } = await db.from("cuentas_instagram").select("modelo_id").eq("activa", true);
  const conCuenta = new Set((cuentas ?? []).map((c) => c.modelo_id as string));
  const { data: rec } = await db.from("panel_config").select("value").eq("key", CLAVE_RECORDATORIOS).maybeSingle();
  const recordatorios: Record<string, string> = { ...((rec?.value as Record<string, string> | null) ?? {}) };
  const listas: string[] = [];
  let avisos = 0;
  let cambioRec = false;
  for (const m of modelos ?? []) {
    const id = m.id as string;
    if (conCuenta.has(id)) {
      if (recordatorios[id]) {
        delete recordatorios[id];
        cambioRec = true;
      }
      continue;
    }
    const p = await progresoCaptacion(id);
    if (!p?.cumplido) continue;
    listas.push(id);
    const avisadoAt = m.umbral_avisado_at as string | null;
    if (!avisadoAt) {
      const { data: marcado } = await db.from("modelos").update({ umbral_avisado_at: new Date().toISOString() }).eq("id", id).is("umbral_avisado_at", null).select("id");
      if (marcado?.length) {
        await encolarTelegram("umbral", id, { reels: p.reels.obj, scripts: p.scripts.obj, packs: p.packs.obj, posts: p.posts.obj });
        avisos++;
      }
      continue;
    }
    const ultimo = new Date(recordatorios[id] ?? avisadoAt).getTime();
    if (Date.now() - ultimo >= RECORDATORIO_MS) {
      const dias = Math.max(1, Math.floor((Date.now() - new Date(avisadoAt).getTime()) / 86400000));
      await encolarTelegram("umbral", id, { recordatorio: true, dias });
      recordatorios[id] = new Date().toISOString();
      cambioRec = true;
      avisos++;
    }
  }
  if (cambioRec) await db.from("panel_config").upsert({ key: CLAVE_RECORDATORIOS, value: recordatorios, updated_at: new Date().toISOString() });
  await guardarListas(() => listas);
  return { listas: listas.length, avisos };
}

/** Si la modelo ya cumple TODOS los objetivos y aun no se avisó, avisa una sola vez ("crea su cuenta de Instagram"). */
export async function evaluarUmbral(modeloId: string): Promise<void> {
  try {
    const p = await progresoCaptacion(modeloId);
    if (!p?.cumplido) return;
    await guardarListas((ids) => [...ids, modeloId]).catch(() => undefined); // sale al momento en la barra lateral
    const { data: marcado } = await createAdminClient().from("modelos").update({ umbral_avisado_at: new Date().toISOString() }).eq("id", modeloId).is("umbral_avisado_at", null).select("id");
    if (marcado?.length) await encolarTelegram("umbral", modeloId, { reels: p.reels.obj, scripts: p.scripts.obj, packs: p.packs.obj, posts: p.posts.obj });
  } catch {
    /* nunca debe romper la accion que lo llama */
  }
}

export type ResumenCaptacion = {
  modelo_id: string;
  nombre: string;
  objetivo: number; // reels
  subidos: number; // reels que ha subido ella
  enEspera: number; // reels subidos y aun sin mandar a editar
  aprobada: boolean; // la agencia termino la captacion de reels (desde entonces se edita todo al subir)
  tieneCuenta: boolean; // ya tiene cuenta de Instagram activa
  progreso: ProgresoCaptacion;
};

/** Modelos visibles con captacion, con sus contadores. Tolerante: sin el SQL devuelve []. */
export async function resumenCaptacion(alcance: Alcance): Promise<ResumenCaptacion[]> {
  try {
    const db = createAdminClient();
    const { data: modelos, error } = await soloVisibles(
      db.from("modelos").select("id, nombre, objetivo_videos, captacion_aprobada_at").not("objetivo_videos", "is", null).eq("activa", true),
      alcance,
      "id",
    );
    if (error || !modelos?.length) return [];

    const filas = await Promise.all(
      modelos.map(async (m) => {
        const [espera, cuentas, progreso] = await Promise.all([
          db.from("library_content").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("estado", "recibido").or("tipo.is.null,tipo.neq.3"), // reels en espera (los TikTok se guardan aparte)
          db.from("cuentas_instagram").select("id", { count: "exact", head: true }).eq("modelo_id", m.id).eq("activa", true),
          progresoCaptacion(m.id as string),
        ]);
        if (!progreso) return null;
        return {
          modelo_id: m.id as string,
          nombre: m.nombre as string,
          objetivo: Number(m.objetivo_videos),
          subidos: progreso.reels.n,
          enEspera: espera.count ?? 0,
          aprobada: Boolean(m.captacion_aprobada_at),
          tieneCuenta: (cuentas.count ?? 0) > 0,
          progreso,
        } satisfies ResumenCaptacion;
      }),
    );
    return filas.filter((f): f is ResumenCaptacion => f !== null);
  } catch {
    return [];
  }
}

/** Avisos del dashboard derivados de la captacion. */
export function avisosCaptacion(lista: ResumenCaptacion[]): Array<{ id: string; nivel: "rojo" | "amarillo"; texto: string; href: string }> {
  const avisos: Array<{ id: string; nivel: "rojo" | "amarillo"; texto: string; href: string }> = [];
  const crearCuenta = lista.filter((c) => c.progreso.cumplido && !c.tieneCuenta);
  if (crearCuenta.length) {
    avisos.push({ id: `cap|cuenta|${crearCuenta.map((c) => c.nombre).sort().join(",")}`, nivel: "rojo", texto: `Ya cumplen todos los mínimos: crea la cuenta de Instagram de ${crearCuenta.map((c) => c.nombre).join(", ")}`, href: "/modelos" });
  }
  const loteListo = lista.filter((c) => !c.aprobada && c.enEspera >= c.objetivo);
  if (loteListo.length) {
    avisos.push({ id: `cap|lote|${loteListo.map((c) => c.nombre).sort().join(",")}`, nivel: "amarillo", texto: `Reels para revisar y mandar a editar: ${loteListo.map((c) => `${c.nombre} (${c.enEspera})`).join(", ")}`, href: "/modelos" });
  }
  return avisos;
}
