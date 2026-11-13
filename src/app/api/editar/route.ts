import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, exigirModelo, soloVisibles } from "@/lib/alcance";
import { cambiarEdicionAuto } from "@/lib/edicionManual";
import { marcarVistoEditar } from "@/lib/editarVistos";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { accion: "enviar", ids: [...] }              -> manda a EDICION esos videos en espera (de una o de varias modelos a la vez)
// POST { accion: "trial", ids, cantidad }          -> los manda a editar y, al terminar, se convierten en original de Trial reels con esas versiones (1-3)
// POST { accion: "vistos" }                        -> marca como vistos los que hay ahora (el numero del menu pasa a contar solo lo que llegue despues)
// POST { accion: "modo", modelo_id, manual }         -> esa modelo: sus videos nuevos esperan aqui (manual, lo normal) o se editan solos (automatico)
// POST { accion: "modo_todas", manual }              -> lo mismo para todas las modelos que ves
export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { accion?: string; ids?: unknown; modelo_id?: string; manual?: unknown; cantidad?: unknown } | null;
  const db = createAdminClient();

  if (b?.accion === "enviar") {
    const ids = Array.isArray(b.ids) ? [...new Set((b.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 500) : [];
    if (!ids.length) return NextResponse.json({ error: "Elige al menos un vídeo" }, { status: 400 });
    const alcance = await alcanceActual();
    // Solo los que esta persona puede ver, que siguen en espera y que son reels (los TikTok se guardan aparte y no se editan)
    const { data: validos } = await soloVisibles(
      db.from("library_content").select("id").in("id", ids).eq("estado", "recibido").eq("origen", "upload_manual").or("tipo.is.null,tipo.not.in.(3,5)"),
      alcance,
    );
    const buenos = (validos ?? []).map((v) => v.id as string);
    if (!buenos.length) return NextResponse.json({ error: "Esos vídeos ya no están en espera" }, { status: 404 });
    const ahora = new Date().toISOString();
    const { error } = await db.from("library_content").update({ estado: "editando", estado_procesamiento: "pendiente", reparto_at: ahora, updated_at: ahora }).in("id", buenos).eq("estado", "recibido");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, enviados: buenos.length });
  }

  // Trial reels desde el contenido bruto: se mandan a editar como siempre y, al terminar, el editor los convierte en original de Trial reels (con N versiones)
  if (b?.accion === "trial") {
    const ids = Array.isArray(b.ids) ? [...new Set((b.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 300) : [];
    if (!ids.length) return NextResponse.json({ error: "Elige al menos un vídeo" }, { status: 400 });
    const cantidad = Math.min(3, Math.max(1, Math.round(Number(b.cantidad)) || 3));
    const alcance = await alcanceActual();
    const { data: piezas } = await soloVisibles(
      db.from("library_content").select("id, modelo_id, cuenta_id, notas_editor").in("id", ids).eq("estado", "recibido").eq("origen", "upload_manual").or("tipo.is.null,tipo.not.in.(3,5)"),
      alcance,
    );
    const lista = (piezas ?? []) as Array<{ id: string; modelo_id: string; cuenta_id: string | null; notas_editor: string | null }>;
    if (!lista.length) return NextResponse.json({ error: "Esos vídeos ya no están en espera" }, { status: 404 });
    // Cada trial necesita una cuenta de Instagram: la del vídeo o, si no la tiene, la principal (o la primera activa) de su modelo
    const modelosSinCuenta = [...new Set(lista.filter((p) => !p.cuenta_id).map((p) => p.modelo_id))];
    const porModelo = new Map<string, string>();
    if (modelosSinCuenta.length) {
      const { data: cuentas } = await db.from("cuentas_instagram").select("id, modelo_id, tipo").in("modelo_id", modelosSinCuenta).eq("activa", true);
      for (const c of (cuentas ?? []) as Array<{ id: string; modelo_id: string; tipo: string | null }>) if (!porModelo.has(c.modelo_id) || c.tipo === "principal") porModelo.set(c.modelo_id, c.id);
    }
    const ahora = new Date().toISOString();
    let enviados = 0;
    const sinCuenta: string[] = [];
    for (const p of lista) {
      const cuenta = p.cuenta_id ?? porModelo.get(p.modelo_id) ?? null;
      if (!cuenta) {
        sinCuenta.push(p.id);
        continue;
      }
      const notas = [(p.notas_editor ?? "").replace(/\[trial=\d\]/g, "").trim(), `[trial=${cantidad}]`].filter(Boolean).join("\n");
      const { error } = await db
        .from("library_content")
        .update({ estado: "editando", estado_procesamiento: "pendiente", cuenta_id: cuenta, notas_editor: notas, reparto_at: ahora, updated_at: ahora })
        .eq("id", p.id)
        .eq("estado", "recibido");
      if (!error) enviados++;
    }
    if (!enviados) return NextResponse.json({ error: "Esas modelos no tienen una cuenta de Instagram activa: los trial reels necesitan una" }, { status: 409 });
    return NextResponse.json({ ok: true, enviados, sinCuenta: sinCuenta.length, sinCuentaIds: sinCuenta, cantidad });
  }

  if (b?.accion === "vistos") {
    const sesion = await sesionPanelActual();
    if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    await marcarVistoEditar(sesion.usuario);
    return NextResponse.json({ ok: true });
  }

  if (b?.accion === "modo") {
    const modeloId = String(b.modelo_id ?? "");
    if (!UUID.test(modeloId) || typeof b.manual !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
    const g = await exigirModelo(modeloId);
    if (g) return g;
    if (!(await cambiarEdicionAuto([modeloId], !b.manual))) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b?.accion === "modo_todas") {
    if (typeof b.manual !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
    const alcance = await alcanceActual();
    const { data: modelos } = await soloVisibles(db.from("modelos").select("id").is("eliminada_at", null), alcance, "id");
    const ids = (modelos ?? []).map((m) => m.id as string);
    if (!(await cambiarEdicionAuto(ids, !b.manual))) return NextResponse.json({ error: "No se pudo guardar, inténtalo otra vez" }, { status: 500 });
    return NextResponse.json({ ok: true, modelos: ids.length });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
