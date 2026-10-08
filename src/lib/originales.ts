import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { borrarDeR2 } from "@/lib/r2";
import { soloVisibles, type Alcance } from "@/lib/alcance";

// Borra del almacen el ARCHIVO ORIGINAL que subio la modelo (y solo ese): los videos editados, las filas de las piezas, su estado
// y su publicacion se conservan. Lo usan la pagina Originales (a mano) y la limpieza automatica por antiguedad.
// Solo se tocan claves de originales ("bruto/..." en R2 o "supabase://portal-uploads/..."), nunca "procesadas/...".
// Todo en bloque (pocas consultas) y en paralelo: borrar 50 videos tarda lo mismo que borrar 1.

const ES_ORIGINAL = /^(bruto\/|supabase:\/\/portal-uploads\/)/;
const COLUMNAS = "id, r2_key, r2_key_original, estado, estado_procesamiento";

type Pieza = { id: string; r2_key: string | null; r2_key_original: string | null; estado: string; estado_procesamiento: string | null };
type Resultado = { id: string; ok: boolean; motivo?: string };

export type RespuestaBorrado = { status: number; body: Record<string, unknown> };

export async function borrarOriginales(ids: string[], alcance: Alcance): Promise<RespuestaBorrado> {
  const supabase = createAdminClient();
  const resultados: Resultado[] = [];

  // 1) Las piezas pedidas y su clave de original
  const { data: pedidas } = await soloVisibles(supabase.from("library_content").select(COLUMNAS).in("id", ids), alcance);
  const porId = new Map(((pedidas ?? []) as Pieza[]).map((p) => [p.id, p]));
  const claveDe = (p: Pieza) => p.r2_key_original ?? p.r2_key;
  const clavesGrupo = new Set<string>();
  for (const id of ids) {
    const p = porId.get(id);
    if (!p) resultados.push({ id, ok: false, motivo: "No existe" });
    else if (!claveDe(p) || !ES_ORIGINAL.test(claveDe(p) as string)) resultados.push({ id, ok: false, motivo: "Esta pieza no tiene un original que borrar" });
    else clavesGrupo.add(claveDe(p) as string);
  }
  if (!clavesGrupo.size) return { status: 200, body: { ok: false, resultados, borrados: 0 } };

  // 2) Todas las piezas que salen de esos originales (fragmentos, rehacer...), en dos consultas
  const lista = Array.from(clavesGrupo);
  const [a, b] = await Promise.all([
    supabase.from("library_content").select(COLUMNAS).in("r2_key", lista),
    supabase.from("library_content").select(COLUMNAS).in("r2_key_original", lista),
  ]);
  const piezas = new Map<string, Pieza>();
  for (const p of [...(a.data ?? []), ...(b.data ?? [])] as Pieza[]) piezas.set(p.id, p);
  for (const p of porId.values()) piezas.set(p.id, p);

  const grupos = new Map<string, Pieza[]>(); // clave de original -> piezas
  for (const p of piezas.values()) {
    for (const k of [p.r2_key_original, p.r2_key]) {
      if (k && clavesGrupo.has(k)) {
        const g = grupos.get(k) ?? [];
        if (!g.includes(p)) g.push(p);
        grupos.set(k, g);
      }
    }
  }

  // 3) Que grupos se pueden borrar (el runner no los esta usando ahora mismo)
  const ejecutables: Array<{ clave: string; piezas: Pieza[]; pedidos: string[] }> = [];
  for (const clave of clavesGrupo) {
    const g = grupos.get(clave) ?? [];
    const pedidos = ids.filter((id) => {
      const p = porId.get(id);
      return p && claveDe(p) === clave;
    });
    if (g.some((p) => p.estado === "editando" && (p.estado_procesamiento === "pendiente" || p.estado_procesamiento === "procesando"))) {
      pedidos.forEach((id) => resultados.push({ id, ok: false, motivo: "Se está editando ahora mismo; espera a que termine" }));
    } else {
      ejecutables.push({ clave, piezas: g, pedidos });
    }
  }
  if (!ejecutables.length) return { status: 200, body: { ok: false, resultados, borrados: 0 } };

  // 4) Marcar todas las piezas de una vez (si falta la columna se avisa sin haber borrado nada)
  const idsMarcar = Array.from(new Set(ejecutables.flatMap((e) => e.piezas.map((p) => p.id))));
  const marca = await supabase.from("library_content").update({ original_borrado_at: new Date().toISOString() }).in("id", idsMarcar);
  if (marca.error) {
    const sinColumna = /original_borrado_at/.test(marca.error.message);
    return {
      status: 500,
      body: { error: sinColumna ? "Falta ejecutar el SQL 20261007_originales_borrado.sql en Supabase (añade la columna original_borrado_at)." : marca.error.message },
    };
  }

  // 5) Borrar los archivos en paralelo. Solo claves de originales, y nunca una que otra pieza (fuera de lo que
  //    se esta borrando) siga usando.
  const idsEnBorrado = new Set(idsMarcar);
  const claves = Array.from(new Set(ejecutables.flatMap((e) => e.piezas.flatMap((p) => [p.r2_key, p.r2_key_original]).filter((k): k is string => Boolean(k) && ES_ORIGINAL.test(k as string)))));
  const [c, d] = await Promise.all([
    supabase.from("library_content").select("id, r2_key, r2_key_original").in("r2_key", claves),
    supabase.from("library_content").select("id, r2_key, r2_key_original").in("r2_key_original", claves),
  ]);
  const enUso = new Set<string>();
  for (const p of [...(c.data ?? []), ...(d.data ?? [])] as Array<{ id: string; r2_key: string | null; r2_key_original: string | null }>) {
    if (idsEnBorrado.has(p.id)) continue;
    if (p.r2_key) enUso.add(p.r2_key);
    if (p.r2_key_original) enUso.add(p.r2_key_original);
  }
  const aBorrar = claves.filter((k) => !enUso.has(k));

  const fallos = new Map<string, string>(); // clave -> motivo
  const deSupabase = new Map<string, string[]>(); // bucket -> rutas
  const deR2: string[] = [];
  for (const k of aBorrar) {
    if (k.startsWith("supabase://")) {
      const sin = k.slice("supabase://".length);
      const barra = sin.indexOf("/");
      deSupabase.set(sin.slice(0, barra), [...(deSupabase.get(sin.slice(0, barra)) ?? []), sin.slice(barra + 1)]);
    } else {
      deR2.push(k);
    }
  }
  await Promise.all([
    ...Array.from(deSupabase.entries()).map(async ([bucket, rutas]) => {
      const { error } = await supabase.storage.from(bucket).remove(rutas);
      if (error) rutas.forEach((r) => fallos.set(`supabase://${bucket}/${r}`, error.message));
    }),
    ...deR2.map(async (k) => {
      try {
        await borrarDeR2(k);
      } catch (e) {
        fallos.set(k, e instanceof Error ? e.message : "No se pudo borrar el archivo");
      }
    }),
  ]);

  // Vistas previas (previews/<hash>.jpg|mp4) de los originales borrados: tambien ocupan espacio
  await Promise.all(
    aBorrar
      .filter((k) => !fallos.has(k))
      .flatMap((k) => {
        const h = createHash("sha1").update(k).digest("hex").slice(0, 20);
        return [`previews/${h}.jpg`, `previews/${h}.mp4`];
      })
      .map((k) => borrarDeR2(k).catch(() => undefined)),
  );

  // 6) Los grupos que fallaron se desmarcan para poder reintentar
  const idsFallidos: string[] = [];
  for (const e of ejecutables) {
    const motivo = e.piezas
      .flatMap((p) => [p.r2_key, p.r2_key_original])
      .map((k) => (k ? fallos.get(k) : undefined))
      .find(Boolean);
    if (motivo) {
      idsFallidos.push(...e.piezas.map((p) => p.id));
      e.pedidos.forEach((id) => resultados.push({ id, ok: false, motivo }));
    } else {
      e.pedidos.forEach((id) => resultados.push({ id, ok: true }));
    }
  }
  if (idsFallidos.length) await supabase.from("library_content").update({ original_borrado_at: null }).in("id", idsFallidos);

  return { status: 200, body: { ok: resultados.some((r) => r.ok), resultados, borrados: resultados.filter((r) => r.ok).length } };
}
