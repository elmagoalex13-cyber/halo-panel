import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { esTipoFotoPerfil, marcarFotoPublicada, quitarFotoPerfil, vistasFotosPerfil } from "@/lib/fotosPerfil";

export const dynamic = "force-dynamic";

// POST { tipo: "perfil" | "banner", accion: "publicada" | "no_publicada" | "eliminar" | "repetir", motivo? }
//  publicada / no_publicada -> marca (o desmarca) la foto como publicada en OnlyFans
//  eliminar                 -> borra la foto (y su archivo)
//  repetir                  -> borra la foto y le dice a la modelo que la suba de nuevo (con un motivo opcional que ve en su portal)
// Dueño y socio, cada uno solo en las modelos que puede ver.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { tipo?: unknown; accion?: unknown; motivo?: unknown } | null;
  if (!b || !esTipoFotoPerfil(b.tipo)) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const quien = sesion.nombre || sesion.usuario;
  let ok = false;
  if (b.accion === "publicada" || b.accion === "no_publicada") ok = await marcarFotoPublicada(id, b.tipo, b.accion === "publicada", quien);
  else if (b.accion === "eliminar") ok = await quitarFotoPerfil(id, b.tipo);
  else if (b.accion === "repetir") {
    const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 300) : "";
    ok = await quitarFotoPerfil(id, b.tipo, { motivo: motivo || null, por: quien });
  } else return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  if (!ok) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
  return NextResponse.json({ ok: true, fotos: await vistasFotosPerfil(id) });
}
