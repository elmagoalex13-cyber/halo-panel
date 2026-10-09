import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { borrarObjetoOF } from "@/lib/r2/onlyfans";
import { invalidarHistorias, listarHistorias, marcarHistoriasVistas, prefijoHistorias } from "@/lib/historiasIG";
import { UUID } from "@/lib/ofServer";

export const dynamic = "force-dynamic";

// Historias de Instagram que suben las modelos, vistas desde Instagram > Historias.
//  GET ?modelo=<id>            -> sus fotos (enlaces de vista y descarga) y las marca como vistas para quien las abre
//  DELETE ?modelo=<id>&key=... -> borra fotos ya publicadas
export async function GET(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const modeloId = req.nextUrl.searchParams.get("modelo") ?? "";
  if (!UUID.test(modeloId)) return NextResponse.json({ error: "Modelo no válida" }, { status: 400 });
  const g = await exigirModelo(modeloId);
  if (g) return g;
  try {
    const historias = await listarHistorias(modeloId);
    const sesion = await sesionPanelActual();
    const ultima = historias.reduce<string | null>((m, h) => (h.fecha && (!m || h.fecha > m) ? h.fecha : m), null);
    if (sesion && ultima) await marcarHistoriasVistas(sesion.usuario, modeloId, ultima).catch(() => undefined);
    return NextResponse.json({ historias });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron cargar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const modeloId = req.nextUrl.searchParams.get("modelo") ?? "";
  if (!UUID.test(modeloId)) return NextResponse.json({ error: "Modelo no válida" }, { status: 400 });
  const g = await exigirModelo(modeloId);
  if (g) return g;
  const keys = req.nextUrl.searchParams.getAll("key");
  if (!keys.length || keys.some((k) => !k.startsWith(prefijoHistorias(modeloId)) || k.includes(".."))) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  try {
    for (const k of keys.slice(0, 300)) await borrarObjetoOF(k);
    invalidarHistorias();
    return NextResponse.json({ ok: true, borradas: keys.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 500 });
  }
}
