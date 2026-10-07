import { NextResponse } from "next/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const dynamic = "force-dynamic";

// Quién está usando el panel y qué secciones tiene ocultas (el menú lateral y las pantallas se adaptan a esto).
export async function GET() {
  const s = await sesionPanelActual();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(s);
}
