import { NextResponse } from "next/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { encolarTelegram } from "@/lib/telegramCola";

export const dynamic = "force-dynamic";

// Mensaje de prueba al grupo de Telegram (lo envia el editor en unos segundos). Solo el dueño.
export async function POST() {
  const s = await sesionPanelActual();
  if (!s?.dueno) return NextResponse.json({ error: "Solo el dueño del panel" }, { status: 403 });
  await encolarTelegram("prueba", null, {});
  return NextResponse.json({ ok: true });
}
