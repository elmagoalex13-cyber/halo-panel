import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { borrarDeR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// DELETE /api/originales   { ids: [<library_content.id>, ...] }
// Borra del almacen el ARCHIVO ORIGINAL que subio la modelo (y solo ese): los videos editados, las filas de las
// piezas, su estado y su publicacion se conservan. Se hace a mano, desde la pagina Originales.
// Solo se tocan claves de originales ("bruto/..." en R2 o "supabase://portal-uploads/..."), nunca "procesadas/...".

const ES_ORIGINAL = /^(bruto\/|supabase:\/\/portal-uploads\/)/;

type Pieza = { id: string; r2_key: string | null; r2_key_original: string | null; estado: string; estado_procesamiento: string | null };

export async function DELETE(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "Faltan ids" }, { status: 400 });

  const supabase = createAdminClient();
  const columnas = "id, r2_key, r2_key_original, estado, estado_procesamiento";
  const resultados: Array<{ id: string; ok: boolean; motivo?: string }> = [];
  const yaTratadas = new Set<string>();

  for (const id of ids) {
    if (yaTratadas.has(id)) continue;
    const { data: pieza } = await supabase.from("library_content").select(columnas).eq("id", id).maybeSingle<Pieza>();
    if (!pieza) {
      resultados.push({ id, ok: false, motivo: "No existe" });
      continue;
    }
    const clave = pieza.r2_key_original ?? pieza.r2_key;
    if (!clave || !ES_ORIGINAL.test(clave)) {
      resultados.push({ id, ok: false, motivo: "Esta pieza no tiene un original que borrar" });
      continue;
    }

    // Todas las piezas que salen de este mismo original (fragmentos, rehacer...)
    const [a, b] = await Promise.all([
      supabase.from("library_content").select(columnas).eq("r2_key", clave),
      supabase.from("library_content").select(columnas).eq("r2_key_original", clave),
    ]);
    const grupo = new Map<string, Pieza>();
    for (const p of [...(a.data ?? []), ...(b.data ?? [])] as Pieza[]) grupo.set(p.id, p);
    grupo.set(pieza.id, pieza);
    const piezas = [...grupo.values()];
    piezas.forEach((p) => yaTratadas.add(p.id));

    // El runner lo esta usando ahora mismo: no tocar.
    if (piezas.some((p) => p.estado === "editando" && (p.estado_procesamiento === "pendiente" || p.estado_procesamiento === "procesando"))) {
      resultados.push({ id, ok: false, motivo: "Se está editando ahora mismo; espera a que termine" });
      continue;
    }

    // Claves de archivos originales a borrar (nunca videos editados)
    const claves = Array.from(new Set(piezas.flatMap((p) => [p.r2_key, p.r2_key_original]).filter((k): k is string => Boolean(k) && ES_ORIGINAL.test(k as string))));
    const idsGrupo = piezas.map((p) => p.id);

    // 1) Marcar primero: si la columna aun no existe se avisa sin haber borrado nada.
    const ahora = new Date().toISOString();
    const marca = await supabase.from("library_content").update({ original_borrado_at: ahora }).in("id", idsGrupo);
    if (marca.error) {
      const sinColumna = /original_borrado_at/.test(marca.error.message);
      return NextResponse.json(
        { error: sinColumna ? "Falta ejecutar el SQL 20261007_originales_borrado.sql en Supabase (añade la columna original_borrado_at)." : marca.error.message },
        { status: 500 },
      );
    }

    // 2) Borrar los archivos (solo los que ninguna otra pieza fuera del grupo siga usando)
    let fallo: string | null = null;
    for (const k of claves) {
      const [c, d] = await Promise.all([
        supabase.from("library_content").select("id").eq("r2_key", k).not("id", "in", `(${idsGrupo.join(",")})`).limit(1),
        supabase.from("library_content").select("id").eq("r2_key_original", k).not("id", "in", `(${idsGrupo.join(",")})`).limit(1),
      ]);
      if ((c.data?.length ?? 0) + (d.data?.length ?? 0) > 0) continue;
      try {
        if (k.startsWith("supabase://")) {
          const sin = k.slice("supabase://".length);
          const barra = sin.indexOf("/");
          const { error } = await supabase.storage.from(sin.slice(0, barra)).remove([sin.slice(barra + 1)]);
          if (error) throw new Error(error.message);
        } else {
          await borrarDeR2(k);
        }
      } catch (e) {
        fallo = e instanceof Error ? e.message : "No se pudo borrar el archivo";
        break;
      }
    }
    if (fallo) {
      await supabase.from("library_content").update({ original_borrado_at: null }).in("id", idsGrupo);
      resultados.push({ id, ok: false, motivo: fallo });
      continue;
    }
    resultados.push({ id, ok: true });
  }

  return NextResponse.json({ ok: resultados.some((r) => r.ok), resultados, borrados: resultados.filter((r) => r.ok).length });
}
