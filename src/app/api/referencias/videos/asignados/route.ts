import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// A que modelos ya esta asignado cada video aprobado: POST { ids: [videoId...] } -> { [videoId]: [{ modelo_id, estado }] }
// Solo cuenta las modelos que el usuario puede ver.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? [...new Set((body.ids as unknown[]).filter((x): x is string => typeof x === "string"))].slice(0, 300) : [];
  if (!ids.length) return NextResponse.json({});

  const db = createAdminClient();
  const alcance = await alcanceActual();
  const permalinkDe = new Map<string, string>(); // permalink -> videoId
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from("referencias_videos").select("id, video_url").in("id", ids.slice(i, i + 100));
    for (const v of data ?? []) {
      if (!v.video_url) continue;
      const codigo = String(v.video_url).match(/([^/]+)\.mp4$/)?.[1];
      permalinkDe.set(codigo ? `https://www.instagram.com/reel/${codigo}/` : String(v.video_url), v.id as string);
    }
  }

  const referenciaDe = new Map<string, string>(); // referenciaId -> videoId
  const permalinks = [...permalinkDe.keys()];
  for (let i = 0; i < permalinks.length; i += 40) {
    const { data } = await db.from("referencias").select("id, url_original").in("url_original", permalinks.slice(i, i + 40));
    for (const r of data ?? []) {
      const v = permalinkDe.get(r.url_original as string);
      if (v) referenciaDe.set(r.id as string, v);
    }
  }

  const resultado: Record<string, Array<{ modelo_id: string; estado: string }>> = {};
  const refs = [...referenciaDe.keys()];
  for (let i = 0; i < refs.length; i += 80) {
    const { data } = await soloVisibles(db.from("encargos").select("referencia_id, modelo_id, estado").in("referencia_id", refs.slice(i, i + 80)).limit(5000), alcance);
    for (const e of (data ?? []) as Array<{ referencia_id: string; modelo_id: string | null; estado: string }>) {
      const v = referenciaDe.get(e.referencia_id);
      if (!v || !e.modelo_id) continue;
      (resultado[v] ??= []).push({ modelo_id: e.modelo_id, estado: e.estado });
    }
  }
  return NextResponse.json(resultado);
}
