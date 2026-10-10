import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { cuentaHecha, devolverCuenta, estadoSemanal, siguienteCuenta, unirseARonda, type CuentaRonda } from "@/lib/rondaVirales";

export const dynamic = "force-dynamic";

// Coordina las extensiones de Chrome (la tuya, la de tu socio y la del lunes automatico) para que no analicen lo mismo a la vez:
//   GET  ?semanal=1                      -> ¿toca la ronda semanal? (la extension lo pregunta cada rato)
//   GET                                  -> estado de la ronda semanal para el panel
//   POST { accion: "unirse", categoria, dias, origen }   -> entra en la ronda en marcha o abre una
//   POST { accion: "siguiente", ronda_id }               -> la siguiente cuenta libre
//   POST { accion: "hecha", ronda_id, cuenta_id, nuevos, ok }
//   POST { accion: "devolver", ronda_id, cuenta_id }
// Solo las cuentas de REFERENCIA se reparten (son las mismas para todos); las de las modelos van por separado.

const usuarioDe = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];

export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  try {
    return NextResponse.json(await estadoSemanal());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    accion?: string;
    categoria?: string;
    dias?: number;
    origen?: string;
    ronda_id?: string;
    cuenta_id?: string;
    nuevos?: number;
    ok?: boolean;
  };
  const rondaId = String(body.ronda_id ?? "");
  const cuentaId = String(body.cuenta_id ?? "");

  try {
    if (body.accion === "unirse") {
      const categoria = body.categoria && body.categoria !== "todas" ? String(body.categoria) : "todas";
      const origen = body.origen === "lunes" ? "lunes" : "manual";
      let q = createAdminClient().from("referencias_cuentas").select("id, username, categoria").eq("activa", true).order("username");
      if (categoria !== "todas") q = q.eq("categoria", categoria);
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const cuentas: CuentaRonda[] = (data ?? []).map((c) => ({ id: c.id as string, username: usuarioDe(c.username), categoria: (c.categoria as string | null) ?? "general", etiqueta: (c.categoria as string | null) ?? "general" }));
      if (!cuentas.length) return NextResponse.json({ error: "No hay cuentas de referencia activas con ese tipo" }, { status: 404 });
      const semana = origen === "lunes" ? (await estadoSemanal()).semana : null;
      const dias = Number(body.dias) > 0 ? Math.min(60, Math.round(Number(body.dias))) : 7;
      return NextResponse.json(await unirseARonda({ usuario: sesion.usuario, categoria, dias, origen, semana, cuentas }));
    }
    if (body.accion === "siguiente" && rondaId) return NextResponse.json(await siguienteCuenta(rondaId, sesion.usuario));
    if (body.accion === "hecha" && rondaId && cuentaId) return NextResponse.json({ ok: true, ronda: await cuentaHecha(rondaId, cuentaId, sesion.usuario, Number(body.nuevos) || 0, body.ok !== false) });
    if (body.accion === "devolver" && rondaId && cuentaId) {
      await devolverCuenta(rondaId, cuentaId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
