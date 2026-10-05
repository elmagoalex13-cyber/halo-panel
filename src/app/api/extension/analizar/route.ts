import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { ajustesDe, analizarCuenta, sanearReels } from "@/lib/viralesExtension";

export const dynamic = "force-dynamic";

// La extension manda los ultimos reels de una cuenta (solo metricas, sin video). Aqui se decide cuales
// son virales y se devuelve la lista de los que hay que subir. Asi la regla vive en un solo sitio.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    modo?: string; cuenta_id?: string; reels?: unknown; dias?: unknown; factor?: unknown; max?: unknown; fase?: string;
  } | null;
  if (!body?.cuenta_id || (body.modo !== "referencias" && body.modo !== "propias")) {
    return NextResponse.json({ error: "Faltan modo o cuenta_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const reels = sanearReels(body.reels);
  const conocidos = new Set<string>();
  let categoria: string | null = null;

  if (body.modo === "referencias") {
    const { data: cuenta } = await supabase.from("referencias_cuentas").select("categoria").eq("id", body.cuenta_id).maybeSingle();
    categoria = cuenta?.categoria ?? "general";
    const { data } = await supabase.from("referencias_videos").select("video_url").eq("cuenta_id", body.cuenta_id);
    for (const v of data ?? []) {
      const codigo = String(v.video_url ?? "").match(/([^/]+)\.mp4$/)?.[1];
      if (codigo) conocidos.add(codigo);
    }
    await supabase.from("referencias_cuentas").update({ ultimo_scrape_at: new Date().toISOString() }).eq("id", body.cuenta_id);
  } else {
    const { data } = await supabase.from("virales_propios").select("codigo").eq("cuenta_id", body.cuenta_id);
    for (const v of data ?? []) conocidos.add(v.codigo);
  }

  // fase "candidatos": la extension solo tiene las metricas de la cuadricula (sin fecha, texto ni audio),
  // asi que aqui solo se aplica el umbral de vistas; fecha y estilo se aplican en la pasada definitiva.
  const candidatos = body.fase === "candidatos";
  const ajustes = ajustesDe(body);
  const r = analizarCuenta(reels, {
    ...ajustes,
    max: candidatos ? Math.max(ajustes.max, 20) : ajustes.max,
    categoria: candidatos ? null : categoria,
    conocidos,
  });
  return NextResponse.json({
    analizados: r.analizados,
    mediana: r.mediana,
    umbral: r.umbral,
    subir: r.virales.map((v) => ({ codigo: v.codigo, vistas: v.vistas, viralScore: v.viralScore })),
  });
}
