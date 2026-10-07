import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirFila } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// Descarga directa del video (el bucket de R2 es de otro dominio y el navegador solo lo abriria).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  { const g = await exigirFila("virales_propios", id); if (g) return g; }
  if (!canUseSupabase()) return new NextResponse(null, { status: 503 });
  const { data } = await createAdminClient().from("virales_propios").select("video_key, codigo").eq("id", id).maybeSingle();
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!data?.video_key || !base) return new NextResponse(null, { status: 404 });
  const res = await fetch(`${base}/${data.video_key}`);
  if (!res.ok || !res.body) return new NextResponse(null, { status: 502 });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${data.codigo}.mp4"`,
    },
  });
}
