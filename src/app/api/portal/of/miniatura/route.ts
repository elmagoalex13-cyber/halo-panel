import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { UUID } from "@/lib/ofServer";
import { subirObjetoOF } from "@/lib/r2/onlyfans";
import { claveMiniatura } from "@/lib/ofMiniaturas";

export const dynamic = "force-dynamic";

const MAX_BYTES = 400 * 1024;

// La modelo sube la miniatura (JPEG pequeno) de una foto que acaba de subir: POST ?id=<id del archivo>, cuerpo = el JPEG.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const cuerpo = Buffer.from(await req.arrayBuffer());
  if (!cuerpo.length || cuerpo.length > MAX_BYTES) return NextResponse.json({ error: "Miniatura no válida" }, { status: 400 });
  if (!(cuerpo[0] === 0xff && cuerpo[1] === 0xd8 && cuerpo[2] === 0xff)) return NextResponse.json({ error: "Solo JPEG" }, { status: 415 }); // firma de un JPEG

  const { data: a } = await createAdminClient().from("of_archivos").select("id, storage_key, bucket, tipo_archivo").eq("id", id).eq("modelo_id", sesion.modeloId).maybeSingle();
  if (!a || a.tipo_archivo !== "foto") return NextResponse.json({ error: "No se encontró" }, { status: 404 });
  try {
    await subirObjetoOF(claveMiniatura(a.storage_key as string), cuerpo, "image/jpeg", (a.bucket as string | null) ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
}
