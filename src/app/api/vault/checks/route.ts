import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { claveChecks, type CampoCheck, type ChecksEntrada } from "@/lib/vaultChecks";

export const dynamic = "force-dynamic";

// POST { id, campo: "acceso" | "valida", valor: boolean } -> marca o desmarca un check interno de una credencial del Vault.
// Mismas reglas que el resto del Vault: el socio solo toca lo del baul compartido.
export async function POST(request: Request) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; campo?: unknown; valor?: unknown };
  const id = typeof b.id === "string" ? b.id : "";
  const campo = b.campo === "acceso" || b.campo === "valida" ? (b.campo as CampoCheck) : null;
  if (!id || !campo || typeof b.valor !== "boolean") return NextResponse.json({ error: "Datos no validos" }, { status: 400 });

  const db = createAdminClient();
  let r = await db.from("vault_panel").select("nombre, ambito, eliminada_at").eq("id", id).maybeSingle();
  if (r.error) r = (await db.from("vault_panel").select("nombre, ambito").eq("id", id).maybeSingle()) as typeof r;
  const e = r.data as { nombre?: string; ambito?: string; eliminada_at?: string | null } | null;
  if (!e || e.nombre?.startsWith("portal:")) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!sesion.dueno && (e.ambito !== "compartido" || e.eliminada_at)) return NextResponse.json({ error: "No tienes acceso a esta entrada" }, { status: 403 });

  const { data: fila } = await db.from("panel_config").select("value").eq("key", claveChecks(id)).maybeSingle();
  const actual = ((fila?.value as ChecksEntrada | null) ?? {}) as ChecksEntrada;
  const nuevo: ChecksEntrada = { ...actual };
  if (b.valor) nuevo[campo] = { por: sesion.nombre || sesion.usuario, at: new Date().toISOString() };
  else delete nuevo[campo];
  const { error } = await db.from("panel_config").upsert({ key: claveChecks(id), value: nuevo, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, checks: nuevo });
}
