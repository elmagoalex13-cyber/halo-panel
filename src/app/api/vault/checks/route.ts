import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { claveChecks, type CampoCheck, type ChecksEntrada } from "@/lib/vaultChecks";
import { encolarTelegram } from "@/lib/telegramCola";
import { PREFIJO_OF, PREFIJO_SKRILL } from "@/lib/accesosModelo";

export const dynamic = "force-dynamic";

// POST { id, campo: "acceso" | "valida" | "invalida", valor: boolean } -> marca o desmarca un check interno de una credencial del Vault.
// «invalida» avisa a la modelo (en su portal y por Telegram si lo tiene) para que vuelva a enviar ese acceso.
// Mismas reglas que el resto del Vault: el socio solo toca lo del baul compartido.
export async function POST(request: Request) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; campo?: unknown; valor?: unknown };
  const id = typeof b.id === "string" ? b.id : "";
  const campo = b.campo === "acceso" || b.campo === "valida" || b.campo === "invalida" ? (b.campo as CampoCheck) : null;
  if (!id || !campo || typeof b.valor !== "boolean") return NextResponse.json({ error: "Datos no validos" }, { status: 400 });

  const db = createAdminClient();
  let r = await db.from("vault_panel").select("nombre, ambito, eliminada_at, modelo_id").eq("id", id).maybeSingle();
  if (r.error) r = (await db.from("vault_panel").select("nombre, ambito, modelo_id").eq("id", id).maybeSingle()) as typeof r;
  const e = r.data as { nombre?: string; ambito?: string; eliminada_at?: string | null; modelo_id?: string | null } | null;
  if (!e || e.nombre?.startsWith("portal:")) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!sesion.dueno && (e.ambito !== "compartido" || e.eliminada_at)) return NextResponse.json({ error: "No tienes acceso a esta entrada" }, { status: 403 });

  const { data: fila } = await db.from("panel_config").select("value").eq("key", claveChecks(id)).maybeSingle();
  const actual = ((fila?.value as ChecksEntrada | null) ?? {}) as ChecksEntrada;
  const nuevo: ChecksEntrada = { ...actual };
  if (b.valor) {
    nuevo[campo] = { por: sesion.nombre || sesion.usuario, at: new Date().toISOString() };
    if (campo === "valida") delete nuevo.invalida;
    if (campo === "invalida") delete nuevo.valida;
    delete nuevo.acceso; // el check «acceso» ya no existe: «válidas» significa que hemos podido acceder (los antiguos cuentan como válidas)
  } else {
    delete nuevo[campo];
    if (campo === "valida") delete nuevo.acceso;
  }
  if (campo === "invalida" && b.valor) delete nuevo.acceso;
  const { error } = await db.from("panel_config").upsert({ key: claveChecks(id), value: nuevo, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Marcada como NO valida (y no lo estaba ya): aviso a la modelo para que vuelva a enviar ese acceso
  let avisada = false;
  const cual = e.nombre?.startsWith(PREFIJO_OF) ? "of" : e.nombre?.startsWith(PREFIJO_SKRILL) ? "skrill" : null;
  if (campo === "invalida" && b.valor && !actual.invalida && e.modelo_id && cual) {
    await encolarTelegram("modelo_accesos_invalidos", e.modelo_id, { cual });
    avisada = true;
  }
  return NextResponse.json({ ok: true, checks: nuevo, avisada });
}
