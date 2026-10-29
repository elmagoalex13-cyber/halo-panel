import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirFila } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { encolarTelegram } from "@/lib/telegramCola";
import { guardarFeedbackFase } from "@/lib/feedbackFases";
import { UUID } from "@/lib/ofServer";

export const dynamic = "force-dynamic";

// POST { coleccion_id, fase: 1..8, tipo: "bien" | "mejorar" | null, texto? }
// Feedback de la agencia sobre UNA fase de un script. La modelo lo ve dentro de esa fase en su portal y le llega por Telegram (agrupado: un mensaje por script).
// tipo null = quitar el feedback de esa fase.
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { coleccion_id?: string; fase?: unknown; tipo?: unknown; texto?: unknown } | null;
  const id = b?.coleccion_id;
  const fase = Number(b?.fase);
  if (!id || !UUID.test(id) || !Number.isInteger(fase) || fase < 1 || fase > 8) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  { const g = await exigirFila("of_colecciones", id); if (g) return g; }
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tipo = b?.tipo === "bien" || b?.tipo === "mejorar" ? b.tipo : null;
  const texto = typeof b?.texto === "string" ? b.texto.trim().slice(0, 600) : "";

  const db = createAdminClient();
  const { data: col } = await db.from("of_colecciones").select("modelo_id, nombre, tipo").eq("id", id).maybeSingle();
  if (!col || col.tipo !== "script") return NextResponse.json({ error: "Solo los scripts tienen fases" }, { status: 400 });

  const ok = await guardarFeedbackFase(id, fase, tipo ? { tipo, texto, at: new Date().toISOString(), por: sesion.nombre || sesion.usuario } : null);
  if (!ok) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
  // Aviso por Telegram solo si hay algo que decir (con «Mejorar» hace falta el comentario)
  if (tipo && (tipo === "bien" || texto)) await encolarTelegram("modelo_fase", col.modelo_id as string, { coleccion_id: id, nombre: col.nombre, fase, tipo, texto });
  const { data: m } = await db.from("modelos").select("telegram_id").eq("id", col.modelo_id as string).maybeSingle();
  return NextResponse.json({ ok: true, telegram: Boolean(m?.telegram_id) });
}
