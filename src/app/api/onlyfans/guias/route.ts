import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { CLAVE_GUIA } from "@/lib/guiaOF";

export const dynamic = "force-dynamic";

// Textos de las guias de PACKS y POSTS que ven las modelos en su portal (la de scripts es fija, tal cual la guia original).
const claves = [CLAVE_GUIA.pack, CLAVE_GUIA.post] as const;

export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await createAdminClient().from("panel_config").select("key, value").in("key", [...claves]);
  if (error) return NextResponse.json({ pack: "", post: "", tablaLista: false });
  const t = (k: string) => String((data ?? []).find((f) => f.key === k)?.value?.texto ?? "");
  return NextResponse.json({ pack: t(CLAVE_GUIA.pack), post: t(CLAVE_GUIA.post), tablaLista: true });
}

// PUT { pack?: string, post?: string }
export async function PUT(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { pack?: unknown; post?: unknown } | null;
  const db = createAdminClient();
  for (const [campo, clave] of [["pack", CLAVE_GUIA.pack], ["post", CLAVE_GUIA.post]] as const) {
    if (typeof body?.[campo] !== "string") continue;
    const texto = (body[campo] as string).slice(0, 20000);
    const { error } = await db.from("panel_config").upsert({ key: clave, value: { texto }, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: /panel_config|relation|schema cache/i.test(error.message) ? "Falta ejecutar el SQL 20261019_escala.sql en Supabase." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
