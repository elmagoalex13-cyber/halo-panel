import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { fraseDesdeDescripcion, sanearReels, scoreEstiloFraseMusica, scoreViralidad, tagsMetricas, type ReelViral } from "@/lib/viralesExtension";
import { exigirFila } from "@/lib/alcance";

export const dynamic = "force-dynamic";

const publicUrl = (key: string) => `${(process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}`;
const claveValida = (key: unknown, prefijo: string): key is string =>
  typeof key === "string" && key.startsWith(prefijo) && !key.includes("..") && /^[\w\-./]+$/.test(key);

// La extension ya ha subido el video (y la miniatura) a R2 con una URL firmada; aqui se registra el reel.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    modo?: string; cuenta_id?: string; reel?: unknown; video_key?: unknown; thumbnail_key?: unknown; mediana?: unknown;
  } | null;
  const [reelBase] = sanearReels([body?.reel]);
  if (!body?.cuenta_id || !reelBase) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });

  const mediana = Number(body.mediana) || 0;
  const reel: ReelViral = { ...reelBase, viralScore: scoreViralidad(reelBase, mediana), estiloScore: scoreEstiloFraseMusica(reelBase) };
  if (body.modo === "propias") { const g = await exigirFila("cuentas_instagram", body.cuenta_id); if (g) return g; }
  const supabase = createAdminClient();

  if (body.modo === "referencias") {
    if (!claveValida(body.video_key, "referencias/")) return NextResponse.json({ error: "video_key invalida" }, { status: 400 });
    const { data: cuenta } = await supabase.from("referencias_cuentas").select("categoria").eq("id", body.cuenta_id).maybeSingle();
    if (!cuenta) return NextResponse.json({ error: "Cuenta de referencia no encontrada" }, { status: 404 });
    const categoria = cuenta.categoria ?? "general";
    const esFrases = categoria === "frases";
    // Si dos personas analizan la misma cuenta a la vez, el reel que ya esta guardado no se duplica
    const { data: yaEsta } = await supabase.from("referencias_videos").select("id").eq("cuenta_id", body.cuenta_id).eq("video_url", body.video_key).limit(1);
    if (yaEsta?.length) return NextResponse.json({ ok: true, duplicado: true });
    const { error } = await supabase.from("referencias_videos").insert({
      cuenta_id: body.cuenta_id,
      video_url: body.video_key,
      thumbnail_url: claveValida(body.thumbnail_key, "referencias/") ? publicUrl(body.thumbnail_key) : null,
      descripcion: reel.descripcion,
      visitas: reel.vistas,
      likes: reel.likes,
      tags: tagsMetricas(reel, categoria),
      frase_detectada: esFrases ? fraseDesdeDescripcion(reel.descripcion) : null,
      formato_propuesto: esFrases ? "tipo2" : null,
      formato_confirmado: esFrases ? "tipo2" : null,
      fecha_publicacion: reel.fecha,
      estado_triaje: "pendiente",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.modo === "propias") {
    if (!claveValida(body.video_key, "propios/")) return NextResponse.json({ error: "video_key invalida" }, { status: 400 });
    const { data: cuenta } = await supabase.from("cuentas_instagram").select("id, modelo_id").eq("id", body.cuenta_id).maybeSingle();
    if (!cuenta) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    const { error } = await supabase.from("virales_propios").upsert(
      {
        cuenta_id: cuenta.id,
        modelo_id: cuenta.modelo_id,
        codigo: reel.codigo,
        video_key: body.video_key,
        thumbnail_url: claveValida(body.thumbnail_key, "propios/") ? publicUrl(body.thumbnail_key) : null,
        descripcion: reel.descripcion,
        vistas: reel.vistas,
        likes: reel.likes,
        comentarios: reel.comentarios,
        compartidos: reel.compartidos,
        viral_score: Number(reel.viralScore.toFixed(3)),
        mediana_cuenta: mediana,
        fecha_publicacion: reel.fecha,
      },
      { onConflict: "cuenta_id,codigo", ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "modo debe ser referencias o propias" }, { status: 400 });
}
