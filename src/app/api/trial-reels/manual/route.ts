import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles, veModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { borrarPedido, crearPedidos, leerPedidos, marcarProgramado, pedidosConVistas } from "@/lib/trialReelsManual";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pedidos visibles para quien mira (con enlaces temporales). */
async function pedidosVisibles() {
  const alcance = await alcanceActual();
  const todos = (await leerPedidos()).filter((p) => veModelo(alcance, p.modelo_id));
  const db = createAdminClient();
  const ids = [...new Set(todos.map((p) => p.viral_id))];
  const { data } = ids.length ? await db.from("virales_propios").select("id, codigo, cuenta_id").in("id", ids) : { data: [] };
  const { data: cuentas } = await db.from("cuentas_instagram").select("id, username");
  const user = new Map((cuentas ?? []).map((c) => [c.id as string, String(c.username ?? "").replace(/^@/, "")]));
  const info = new Map((data ?? []).map((v) => [v.id as string, `${user.get(v.cuenta_id as string) ?? "cuenta"}_${v.codigo}`]));
  return pedidosConVistas(todos, (p, n) => `trial_${info.get(p.viral_id) ?? p.viral_id}_v${n}.mp4`);
}

// GET -> pedidos (lo usa la pagina para ver el avance mientras se generan)
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ pedidos: [] });
  return NextResponse.json({ pedidos: await pedidosVisibles() });
}

// POST { accion: "generar", viral_ids: [...], cantidad?: 1|2|3 }  -> pide esas versiones (3 por defecto) de cada uno
// POST { accion: "programado", pedido_id, n, valor } -> marca una version como programada (o no)
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const quien = sesion.nombre || sesion.usuario;
  const b = (await req.json().catch(() => null)) as { accion?: unknown; viral_ids?: unknown; cantidad?: unknown; pedido_id?: unknown; n?: unknown; valor?: unknown } | null;

  if (b?.accion === "generar") {
    const ids = Array.isArray(b.viral_ids) ? [...new Set((b.viral_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 100) : [];
    if (!ids.length) return NextResponse.json({ error: "Elige al menos un vídeo" }, { status: 400 });
    const db = createAdminClient();
    const alcance = await alcanceActual();
    const [virales, cuentas] = await Promise.all([
      soloVisibles(db.from("virales_propios").select("id, cuenta_id, modelo_id, video_key").in("id", ids), alcance),
      soloVisibles(db.from("cuentas_instagram").select("id, modelo_id"), alcance),
    ]);
    const modeloDeCuenta = new Map((cuentas.data ?? []).map((c) => [c.id as string, (c.modelo_id as string | null) ?? null]));
    const validos = (virales.data ?? [])
      .filter((v) => v.video_key)
      .map((v) => ({ viral_id: v.id as string, modelo_id: ((v.modelo_id as string | null) ?? modeloDeCuenta.get(v.cuenta_id as string) ?? null) as string | null }))
      .filter((v) => veModelo(alcance, v.modelo_id));
    if (!validos.length) return NextResponse.json({ error: "Esos vídeos no están disponibles" }, { status: 404 });
    const r = await crearPedidos(validos, quien, Number(b.cantidad) || 3);
    if (!r.ok) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
    return NextResponse.json({ ok: true, nuevos: r.nuevos, pedidos: await pedidosVisibles() });
  }

  if (b?.accion === "programado") {
    const id = typeof b.pedido_id === "string" ? b.pedido_id : "";
    const n = Number(b.n);
    if (!id || !Number.isInteger(n) || typeof b.valor !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
    const alcance = await alcanceActual();
    if (!(await leerPedidos()).some((p) => p.id === id && veModelo(alcance, p.modelo_id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!(await marcarProgramado(id, n, b.valor, quien))) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
    return NextResponse.json({ ok: true, pedidos: await pedidosVisibles() });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

// DELETE ?id=<pedido> -> borra esa tanda de 3 (y sus archivos)
export async function DELETE(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const alcance = await alcanceActual();
  if (!(await leerPedidos()).some((p) => p.id === id && veModelo(alcance, p.modelo_id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!(await borrarPedido(id))) return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
  return NextResponse.json({ ok: true, pedidos: await pedidosVisibles() });
}
