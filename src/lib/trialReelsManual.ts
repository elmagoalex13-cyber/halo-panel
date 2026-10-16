// Seccion «Trial reels»: por cada video viral de una modelo (virales_propios) el editor (runner/src/trial_reels.mjs) genera 3 versiones «nuevas»
// (zoom a la izquierda / derecha / centro, brillo, contraste, saturacion, tono, filtro suave y sin metadatos) que la persona descarga y programa a mano.
// Los pedidos viven en panel_config (clave trial_reels_pedidos, sin tabla nueva) con «comparar y cambiar»; los videos, en R2 (trial-reels/...).
import { createAdminClient } from "@/lib/supabase/server";
import { borrarDeR2, getSignedDownloadUrl } from "@/lib/r2";

export const CLAVE_TRIAL_REELS = "trial_reels_pedidos";
export const VARIANTES = 3;

export type VarianteTrial = {
  n: number;
  key: string;
  resumen: string[];
  duracion: number;
  programado_at?: string;
  programado_por?: string;
  // Enlace del reel publicado en Instagram (lo pega la persona): sirve para no volver a usar esa copia como original y para ver sus visitas
  ig_codigo?: string;
  ig_url?: string;
  ig_vistas?: number;
  ig_likes?: number;
  ig_at?: string;
  hash?: string[]; // huella visual de esta version (la usa el editor para reconocerla cuando se publica)
};
export type PedidoTrial = {
  id: string;
  viral_id: string;
  modelo_id: string | null;
  cantidad?: number; // cuantas versiones se piden (1 a 3; si falta, 3)
  estado: "pendiente" | "procesando" | "listo" | "error";
  at: string;
  por: string;
  empezado_at?: string;
  terminado_at?: string;
  error?: string | null;
  variantes: VarianteTrial[];
};
export type VarianteVista = {
  n: number;
  resumen: string[];
  duracion: number;
  vista: string;
  descarga: string;
  programado_at: string | null;
  programado_por: string | null;
  ig_url: string | null;
  ig_vistas: number | null;
  ig_likes: number | null;
  ig_at: string | null;
};
export type PedidoVista = Omit<PedidoTrial, "variantes"> & { variantes: VarianteVista[] };

async function leer(): Promise<{ pedidos: PedidoTrial[]; updated_at: string | null }> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", CLAVE_TRIAL_REELS).maybeSingle();
  const v = data?.value as { pedidos?: PedidoTrial[] } | null | undefined;
  return { pedidos: Array.isArray(v?.pedidos) ? v.pedidos : [], updated_at: (data?.updated_at as string | undefined) ?? null };
}

export const leerPedidos = async () => (await leer()).pedidos;

async function cambiar(fn: (p: PedidoTrial[]) => PedidoTrial[] | null): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 6; i++) {
    const { pedidos, updated_at } = await leer();
    const nuevos = fn(pedidos);
    if (nuevos === null) return true;
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await db.from("panel_config").insert({ key: CLAVE_TRIAL_REELS, value: { pedidos: nuevos }, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data, error } = await db.from("panel_config").update({ value: { pedidos: nuevos }, updated_at: ahora }).eq("key", CLAVE_TRIAL_REELS).eq("updated_at", updated_at).select("key");
      if (!error && data?.length) return true;
    }
  }
  return false;
}

/** Pide 3 versiones de cada viral. A los que ya tienen un pedido en marcha no se les repite. Devuelve cuantos pedidos nuevos hay. */
export async function crearPedidos(virales: Array<{ viral_id: string; modelo_id: string | null }>, por: string, cantidad = VARIANTES): Promise<{ ok: boolean; nuevos: number }> {
  const n = Math.min(VARIANTES, Math.max(1, Math.round(cantidad) || VARIANTES));
  let nuevos = 0;
  const ok = await cambiar((lista) => {
    const activos = new Set(lista.filter((p) => p.estado === "pendiente" || p.estado === "procesando").map((p) => p.viral_id));
    const crear = virales.filter((v) => !activos.has(v.viral_id));
    nuevos = crear.length;
    if (!crear.length) return null;
    const ahora = Date.now();
    return [
      ...lista,
      ...crear.map((v, i): PedidoTrial => ({ id: crypto.randomUUID(), viral_id: v.viral_id, modelo_id: v.modelo_id, cantidad: n, estado: "pendiente", at: new Date(ahora + i).toISOString(), por, variantes: [] })),
    ];
  });
  return { ok, nuevos };
}

/** Borra un pedido (y sus videos del almacen). */
export async function borrarPedido(id: string): Promise<boolean> {
  let claves: string[] = [];
  const ok = await cambiar((lista) => {
    const p = lista.find((x) => x.id === id);
    if (!p) return null;
    claves = p.variantes.map((v) => v.key);
    return lista.filter((x) => x.id !== id);
  });
  if (ok) await Promise.all(claves.filter((k) => k.startsWith("trial-reels/")).map((k) => borrarDeR2(k).catch(() => undefined)));
  return ok;
}

/** Marca (o desmarca) una version como ya programada. */
export async function marcarProgramado(id: string, n: number, valor: boolean, por: string): Promise<boolean> {
  return cambiar((lista) => {
    if (!lista.some((p) => p.id === id)) return null;
    return lista.map((p) =>
      p.id !== id
        ? p
        : {
            ...p,
            variantes: p.variantes.map((v) => {
              if (v.n !== n) return v;
              const nueva = { ...v };
              if (valor) {
                nueva.programado_at = new Date().toISOString();
                nueva.programado_por = por;
              } else {
                delete nueva.programado_at;
                delete nueva.programado_por;
              }
              return nueva;
            }),
          },
    );
  });
}

/** Codigo del reel a partir de su enlace de Instagram (reel/<codigo>/ o p/<codigo>/). */
export function codigoDeEnlace(url: string): string | null {
  return /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,20})/i.exec(url.trim())?.[1] ?? null;
}

/** Apunta (o quita, con url vacia) el enlace del reel publicado de una version; al apuntarlo se marca tambien como programada. */
export async function marcarPublicado(id: string, n: number, url: string, por: string): Promise<{ ok: boolean; error?: string }> {
  const limpio = url.trim();
  const codigo = limpio ? codigoDeEnlace(limpio) : null;
  if (limpio && !codigo) return { ok: false, error: "Ese enlace no parece de un reel de Instagram (instagram.com/reel/…)" };
  const ok = await cambiar((lista) => {
    if (!lista.some((p) => p.id === id)) return null;
    return lista.map((p) =>
      p.id !== id
        ? p
        : {
            ...p,
            variantes: p.variantes.map((v) => {
              if (v.n !== n) return v;
              const nueva = { ...v };
              delete nueva.ig_codigo;
              delete nueva.ig_url;
              delete nueva.ig_vistas;
              delete nueva.ig_likes;
              delete nueva.ig_at;
              if (codigo) {
                nueva.ig_codigo = codigo;
                nueva.ig_url = `https://www.instagram.com/reel/${codigo}/`;
                if (!nueva.programado_at) {
                  nueva.programado_at = new Date().toISOString();
                  nueva.programado_por = por;
                }
              }
              return nueva;
            }),
          },
    );
  });
  return ok ? { ok } : { ok, error: "No se pudo guardar" };
}

/** Codigos de Instagram de las copias nuestras ya publicadas (no son originales: nunca se usan como fuente ni se guardan como virales). */
export async function codigosDeCopias(): Promise<Set<string>> {
  const s = new Set<string>();
  for (const p of await leerPedidos()) for (const v of p.variantes) if (v.ig_codigo) s.add(v.ig_codigo);
  // Las que reconoce solo el editor comparando la imagen con la de nuestras versiones y la de los originales anteriores (runner/src/copias.mjs)
  const { data } = await createAdminClient().from("panel_config").select("value").eq("key", "virales_copias").maybeSingle();
  const copias = (data?.value as { copias?: Record<string, unknown> } | null)?.copias;
  if (copias && typeof copias === "object") for (const c of Object.keys(copias)) s.add(c);
  return s;
}

/** Pone al dia las visitas/likes de las copias publicadas con las cifras de hoy que trae la busqueda (por codigo de reel). */
export async function actualizarMetricasCopias(porCodigo: Map<string, { vistas: number; likes: number }>): Promise<void> {
  if (!porCodigo.size) return;
  const ahora = new Date().toISOString();
  await cambiar((lista) => {
    let hay = false;
    const nueva = lista.map((p) => ({
      ...p,
      variantes: p.variantes.map((v) => {
        const m = v.ig_codigo ? porCodigo.get(v.ig_codigo) : undefined;
        if (!m) return v;
        hay = true;
        return { ...v, ig_vistas: m.vistas, ig_likes: m.likes, ig_at: ahora };
      }),
    }));
    return hay ? nueva : null;
  });
}

/** Pedidos con enlaces temporales para ver y descargar cada version. `nombre` da el nombre del archivo descargado. */
export async function pedidosConVistas(pedidos: PedidoTrial[], nombre: (p: PedidoTrial, n: number) => string): Promise<PedidoVista[]> {
  return Promise.all(
    pedidos.map(async (p) => ({
      ...p,
      variantes: await Promise.all(
        [...p.variantes]
          .sort((a, b) => a.n - b.n)
          .map(async (v) => ({
            n: v.n,
            resumen: v.resumen,
            duracion: v.duracion,
            vista: await getSignedDownloadUrl(v.key).catch(() => ""),
            descarga: await getSignedDownloadUrl(v.key, undefined, nombre(p, v.n)).catch(() => ""),
            programado_at: v.programado_at ?? null,
            programado_por: v.programado_por ?? null,
            ig_url: v.ig_url ?? null,
            ig_vistas: v.ig_vistas ?? null,
            ig_likes: v.ig_likes ?? null,
            ig_at: v.ig_at ?? null,
          })),
      ),
    })),
  );
}
