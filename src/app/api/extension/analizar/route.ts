import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { ajustesDe, analizarCuenta, mediana, sanearReels } from "@/lib/viralesExtension";
import { exigirFila } from "@/lib/alcance";
import { actualizarMetricasCopias, codigosDeCopias } from "@/lib/trialReelsManual";

export const dynamic = "force-dynamic";

// La extension manda los ultimos reels de una cuenta (solo metricas, sin video). Aqui se decide cuales
// son virales y se devuelve la lista de los que hay que subir. Asi la regla vive en un solo sitio.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    modo?: string; cuenta_id?: string; reels?: unknown; dias?: unknown; factor?: unknown; max?: unknown; fase?: string; origen?: string; ranking?: unknown;
  } | null;
  if (!body?.cuenta_id || (body.modo !== "referencias" && body.modo !== "propias")) {
    return NextResponse.json({ error: "Faltan modo o cuenta_id" }, { status: 400 });
  }

  if (body.modo === "propias") { const g = await exigirFila("cuentas_instagram", body.cuenta_id); if (g) return g; }
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
  // Los reels que son copias nuestras (trial reels que ya se publicaron) NO son originales: no se guardan como virales ni se usan como fuente.
  // De paso se anotan sus visitas de hoy para ver cuales funcionan.
  let copias = new Set<string>();
  if (body.modo === "propias") {
    copias = await codigosDeCopias().catch(() => new Set<string>());
    if (candidatos && copias.size) {
      await actualizarMetricasCopias(new Map(reels.filter((r) => copias.has(r.codigo)).map((r) => [r.codigo, { vistas: r.vistas, likes: r.likes }]))).catch(() => undefined);
    }
  }
  // Virales propios: cada busqueda trae las cifras de HOY de todos los reels de la cuenta, asi que se aprovechan para poner al dia los que ya estaban
  // guardados (si no, se quedaban con las visitas del dia que se guardaron aunque el reel siguiera creciendo).
  if (body.modo === "propias" && candidatos) {
    const frescos = reels.filter((r) => conocidos.has(r.codigo) && r.vistas > 0);
    const med = mediana(reels.filter((r) => r.esVideo && r.vistas > 0).map((r) => r.vistas));
    for (let i = 0; i < frescos.length; i += 10) {
      await Promise.all(
        frescos.slice(i, i + 10).map((r) =>
          supabase.from("virales_propios").update({ vistas: r.vistas, likes: r.likes, comentarios: r.comentarios, compartidos: r.compartidos, mediana_cuenta: med }).eq("cuenta_id", body.cuenta_id as string).eq("codigo", r.codigo),
        ),
      );
    }
  }
  // Busqueda manual: se garantizan al menos 5 videos por cuenta (los que superan el umbral y, si faltan, los mas vistos del periodo elegido).
  // La ronda automatica del lunes no lo hace: ahi solo entran los que de verdad destacan.
  const ranking = body.origen === "lunes" ? 0 : 5;
  const r = analizarCuenta(reels, {
    ...ajustes,
    ranking,
    max: candidatos ? Math.max(ajustes.max, 20) : ajustes.max,
    categoria: candidatos ? null : categoria,
    conocidos: new Set([...conocidos, ...copias]),
  });
  return NextResponse.json({
    analizados: r.analizados,
    mediana: r.mediana,
    umbral: r.umbral,
    por_ranking: r.porRanking,
    subir: r.virales.map((v) => ({ codigo: v.codigo, vistas: v.vistas, viralScore: v.viralScore })),
  });
}
