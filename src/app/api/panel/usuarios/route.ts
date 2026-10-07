import { NextRequest, NextResponse } from "next/server";
import { areasValidas } from "@/lib/areas";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { crearUsuarioPanel, listarUsuariosPanel, nuevaPassword, sesionPanelActual } from "@/lib/panelUsuarios";

export const dynamic = "force-dynamic";

// Gestión de usuarios del panel. SOLO el dueño (el usuario de las variables de entorno): lo exige el middleware y se
// vuelve a comprobar aquí.
async function soloDueno() {
  const s = await sesionPanelActual();
  return s?.dueno ? s : null;
}
const sinSupabase = () => NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
const prohibido = () => NextResponse.json({ error: "Solo el dueño del panel puede hacer esto" }, { status: 403 });
const faltaTabla = (m: string) => (/panel_usuarios|relation/i.test(m) ? "Falta ejecutar el SQL 20261010_panel_usuarios.sql en Supabase." : m);

export async function GET() {
  if (!(await soloDueno())) return prohibido();
  if (!canUseSupabase()) return sinSupabase();
  try {
    return NextResponse.json({ usuarios: await listarUsuariosPanel() });
  } catch (e) {
    return NextResponse.json({ error: faltaTabla(e instanceof Error ? e.message : "Error") }, { status: 500 });
  }
}

// Crea un usuario nuevo. Devuelve su contraseña UNA sola vez (luego solo se puede generar otra).
export async function POST(req: NextRequest) {
  if (!(await soloDueno())) return prohibido();
  if (!canUseSupabase()) return sinSupabase();
  const body = (await req.json().catch(() => null)) as { username?: string; nombre?: string; areas_denegadas?: unknown } | null;
  try {
    const r = await crearUsuarioPanel(body?.username ?? "", body?.nombre ?? "", areasValidas(body?.areas_denegadas ?? ["leads"]));
    return NextResponse.json({ ok: true, usuario: r.usuario, password: r.password });
  } catch (e) {
    return NextResponse.json({ error: faltaTabla(e instanceof Error ? e.message : "No se pudo crear") }, { status: 400 });
  }
}

// PATCH { id, activo?, areas_denegadas?, nombre?, nueva_password?: true }
export async function PATCH(req: NextRequest) {
  if (!(await soloDueno())) return prohibido();
  if (!canUseSupabase()) return sinSupabase();
  const body = (await req.json().catch(() => null)) as { id?: string; activo?: boolean; areas_denegadas?: unknown; nombre?: string; nueva_password?: boolean } | null;
  if (!body?.id) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });

  const cambios: Record<string, unknown> = {};
  if (typeof body.activo === "boolean") cambios.activo = body.activo;
  if (body.areas_denegadas !== undefined) cambios.areas_denegadas = areasValidas(body.areas_denegadas);
  if (typeof body.nombre === "string") cambios.nombre = body.nombre.trim().slice(0, 80) || null;
  try {
    if (Object.keys(cambios).length) {
      const { error } = await createAdminClient().from("panel_usuarios").update(cambios).eq("id", body.id);
      if (error) throw new Error(error.message);
    }
    const password = body.nueva_password ? await nuevaPassword(body.id) : undefined;
    return NextResponse.json({ ok: true, password });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await soloDueno())) return prohibido();
  if (!canUseSupabase()) return sinSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });
  const { error } = await createAdminClient().from("panel_usuarios").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
