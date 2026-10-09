import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { slotDe, type ArchivoOF } from "@/lib/onlyfans";
import { UUID, coleccionDeModelo, tipoDeArchivo } from "@/lib/ofServer";
import { bucketOF, tamanoEnR2, urlVista } from "@/lib/r2/onlyfans";
import { evaluarUmbral } from "@/lib/captacion";

export const dynamic = "force-dynamic";

// Registra un archivo que ya se subió a R2 (comprueba que existe y que pesa lo mismo que el original).
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    coleccion_id?: string; key?: string; fase?: number; slot?: string; nombre_original?: string; size?: number; mime?: string; duracion_seg?: number;
  } | null;
  if (!body?.coleccion_id || !UUID.test(body.coleccion_id) || !body.key) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (!body.key.startsWith(`onlyfans/${sesion.modeloId}/${body.coleccion_id}/`) || body.key.includes("..")) {
    return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  }
  const tipo = tipoDeArchivo(body.mime, body.nombre_original);
  if (!tipo) return NextResponse.json({ error: "Solo fotos y vídeos" }, { status: 415 });

  const supabase = createAdminClient();
  const col = await coleccionDeModelo(supabase, body.coleccion_id, sesion.modeloId);
  if (!col) return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  if (col.estado === "entregado") return NextResponse.json({ error: "Ya está entregada" }, { status: 409 });

  const real = await tamanoEnR2(body.key);
  if (real === null) return NextResponse.json({ error: "El archivo no llegó completo. Vuelve a subirlo." }, { status: 404 });
  if (body.size && real !== Number(body.size)) return NextResponse.json({ error: "El archivo llegó incompleto. Vuelve a subirlo." }, { status: 409 });

  let fase: number | null = null;
  let slotId: string | null = null;
  let consultaOrden = supabase.from("of_archivos").select("orden").eq("coleccion_id", col.id);
  if (col.tipo === "script") {
    const slot = slotDe(Number(body.fase), String(body.slot));
    if (!slot || slot.tipo !== tipo) return NextResponse.json({ error: "Hueco no válido" }, { status: 400 });
    fase = Number(body.fase);
    slotId = slot.slot;
    consultaOrden = consultaOrden.eq("fase", fase).eq("slot", slot.slot);
  } else {
    consultaOrden = consultaOrden.eq("tipo_archivo", tipo);
  }
  const { data: previos } = await consultaOrden;
  const orden = Math.max(0, ...((previos ?? []) as Array<{ orden: number }>).map((r) => r.orden)) + 1;

  const { data, error } = await supabase
    .from("of_archivos")
    .insert({
      coleccion_id: col.id,
      modelo_id: sesion.modeloId,
      fase,
      slot: slotId,
      tipo_archivo: tipo,
      orden,
      nombre_original: (body.nombre_original ?? "").slice(0, 200) || null,
      mime: (body.mime ?? "").slice(0, 100) || null,
      size_bytes: real,
      duracion_seg: Number.isFinite(Number(body.duracion_seg)) && Number(body.duracion_seg) > 0 ? Number(body.duracion_seg) : null,
      bucket: bucketOF(),
      storage_key: body.key,
    })
    .select("id, coleccion_id, fase, slot, tipo_archivo, orden, nombre_original, mime, size_bytes, duracion_seg, descargado_at, subido_of_at, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const archivo = data as ArchivoOF;
  if (col.tipo === "post") await evaluarUmbral(sesion.modeloId); // los posts se cuentan al subirlos (no hay «entregar»)
  return NextResponse.json({ ok: true, archivo, vista: tipo === "foto" ? await urlVista(body.key) : null });
}
