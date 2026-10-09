import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { borrarObjetoOF } from "@/lib/r2/onlyfans";
import { listarHistorias, prefijoHistorias } from "@/lib/historiasIG";

export const dynamic = "force-dynamic";

// Historias de Instagram de una modelo, vistas desde el panel. GET lista (con enlaces de vista y descarga); DELETE ?key= borra una.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  try {
    return NextResponse.json({ historias: await listarHistorias(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron cargar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const keys = req.nextUrl.searchParams.getAll("key");
  if (!keys.length || keys.some((k) => !k.startsWith(prefijoHistorias(id)) || k.includes(".."))) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  try {
    for (const k of keys.slice(0, 300)) await borrarObjetoOF(k);
    return NextResponse.json({ ok: true, borradas: keys.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 500 });
  }
}
