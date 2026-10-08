import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles, veModelo, modeloProhibido } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { encolarTelegram } from "@/lib/telegramCola";

export const dynamic = "force-dynamic";

const TIPOS_AVISO = ["reels", "script", "pack", "post", "otro"] as const;
type Item = { tipo: (typeof TIPOS_AVISO)[number]; cantidad?: number };

// Avisos de la agencia a las modelos ("necesitamos reels / un script / packs / posts / otra cosa"), desde el dashboard.
//  GET  -> modelos a las que puede avisar (con si tienen Telegram) + historial reciente
//  POST { modelo_ids: [...], items: [{ tipo, cantidad? }], texto? }
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const db = createAdminClient();
  const alcance = await alcanceActual();
  const { data: modelos } = await soloVisibles(db.from("modelos").select("id, nombre, ambito, telegram_id, activa").eq("activa", true).order("nombre"), alcance, "id");
  const lista = (modelos ?? []).map((m) => ({ id: m.id as string, nombre: m.nombre as string, ambito: m.ambito as string, telegram: Boolean(m.telegram_id) }));

  const ids = lista.map((m) => m.id);
  let historial: Array<{ id: string; modelo: string; items: Item[]; texto: string | null; creado_por: string | null; created_at: string; telegram: boolean }> = [];
  if (ids.length) {
    const { data, error } = await db.from("avisos_modelos").select("id, modelo_id, items, texto, creado_por, created_at, telegram").in("modelo_id", ids).order("created_at", { ascending: false }).limit(30);
    if (!error) {
      const nombre = new Map(lista.map((m) => [m.id, m.nombre]));
      historial = (data ?? []).map((a) => ({ id: a.id as string, modelo: nombre.get(a.modelo_id as string) ?? "", items: (a.items ?? []) as Item[], texto: a.texto as string | null, creado_por: a.creado_por as string | null, created_at: a.created_at as string, telegram: Boolean(a.telegram) }));
    }
  }
  return NextResponse.json({ modelos: lista, historial });
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { modelo_ids?: unknown; items?: unknown; texto?: unknown } | null;
  const ids = Array.isArray(body?.modelo_ids) ? [...new Set((body.modelo_ids as unknown[]).filter((x): x is string => typeof x === "string"))].slice(0, 100) : [];
  const items: Item[] = (Array.isArray(body?.items) ? (body.items as Array<Record<string, unknown>>) : [])
    .filter((i) => TIPOS_AVISO.includes(i?.tipo as Item["tipo"]))
    .map((i) => ({ tipo: i.tipo as Item["tipo"], ...(Number(i.cantidad) > 0 ? { cantidad: Math.min(500, Math.round(Number(i.cantidad))) } : {}) }))
    .slice(0, 5);
  const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, 600) : "";
  if (!ids.length) return NextResponse.json({ error: "Elige al menos una modelo" }, { status: 400 });
  if (!items.length && !texto) return NextResponse.json({ error: "Elige qué contenido necesitáis o escribe un mensaje" }, { status: 400 });

  const alcance = await alcanceActual();
  if (!ids.every((id) => veModelo(alcance, id))) return modeloProhibido();

  const db = createAdminClient();
  const sesion = await sesionPanelActual();
  const { data: modelos } = await db.from("modelos").select("id, nombre, telegram_id").in("id", ids);
  const filas = (modelos ?? []).map((m) => ({ modelo_id: m.id as string, items, texto: texto || null, creado_por: sesion?.usuario ?? null, telegram: Boolean(m.telegram_id) }));
  const { data: creados, error } = await db.from("avisos_modelos").insert(filas).select("id, modelo_id");
  if (error) {
    const falta = /avisos_modelos|relation|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta ejecutar el SQL 20261023_avisos_modelos.sql en Supabase." : error.message }, { status: falta ? 409 : 500 });
  }
  for (const a of creados ?? []) await encolarTelegram("modelo_aviso", a.modelo_id as string, { aviso_id: a.id, items, texto });

  const sinTelegram = (modelos ?? []).filter((m) => !m.telegram_id).map((m) => m.nombre as string);
  return NextResponse.json({ ok: true, enviados: filas.length, conTelegram: filas.length - sinTelegram.length, sinTelegram });
}
