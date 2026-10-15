import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Frases del banco que tienen musica (para elegir la musica de un video en la Mesa de aprobacion).
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const db = createAdminClient();
  const { data: lista } = await db.from("panel_config").select("value").eq("key", "frases_con_audio").maybeSingle();
  const ids = ((lista?.value as { ids?: string[] } | null)?.ids ?? []) as string[];
  if (!ids.length) return NextResponse.json({ frases: [] });
  const { data } = await db.from("banco_frases_canciones").select("id, frase, cancion_nombre, cancion_artista").in("id", ids.slice(0, 300));
  return NextResponse.json({
    frases: (data ?? []).map((f) => ({
      id: f.id as string,
      frase: String(f.frase).replace(/\s+/g, " ").slice(0, 90),
      cancion: f.cancion_nombre && f.cancion_nombre !== "Sin cancion" && f.cancion_nombre !== "varios" ? `${f.cancion_nombre}${f.cancion_artista ? ` · ${f.cancion_artista}` : ""}` : null,
    })),
  });
}
