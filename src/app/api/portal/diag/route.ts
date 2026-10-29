import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

const CLAVE = "portal_subida_diag";

// POST { evento, datos? }  El portal anota que pasa al subir videos (elegir, empezar, errores) para poder ver POR QUE falla en el movil de cada modelo.
// Se guardan los ultimos 300 sucesos en panel_config (sin tabla nueva). No lleva datos personales: solo nombre de la modelo, tipo de movil y tamaños.
export async function POST(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion || !canUseSupabase()) return NextResponse.json({ ok: false }, { status: 200 });
  const b = (await req.json().catch(() => null)) as { evento?: unknown; datos?: unknown } | null;
  const evento = typeof b?.evento === "string" ? b.evento.slice(0, 40) : "";
  if (!evento) return NextResponse.json({ ok: false });
  const datos = b?.datos && typeof b.datos === "object" ? JSON.parse(JSON.stringify(b.datos).slice(0, 1500)) : null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 160);
  const db = createAdminClient();
  for (let i = 0; i < 4; i++) {
    const { data } = await db.from("panel_config").select("value, updated_at").eq("key", CLAVE).maybeSingle();
    const lista = (((data?.value as { lista?: unknown[] } | null)?.lista ?? []) as unknown[]).slice(0, 299);
    const nuevo = { lista: [{ at: new Date().toISOString(), modelo: sesion.modeloId, evento, datos, ua }, ...lista] };
    const ahora = new Date().toISOString();
    if (!data) {
      const { error } = await db.from("panel_config").insert({ key: CLAVE, value: nuevo, updated_at: ahora });
      if (!error) break;
    } else {
      const { data: ok, error } = await db.from("panel_config").update({ value: nuevo, updated_at: ahora }).eq("key", CLAVE).eq("updated_at", data.updated_at).select("key");
      if (!error && ok?.length) break;
    }
  }
  return NextResponse.json({ ok: true });
}
