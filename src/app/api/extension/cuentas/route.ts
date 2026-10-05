import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { AJUSTES_POR_DEFECTO } from "@/lib/viralesExtension";

export const dynamic = "force-dynamic";

// Lista de cuentas que la extension de Chrome tiene que abrir.
//   ?modo=referencias[&categoria=frases|hablado|referencia|general]  -> cuentas de referencia activas
//   ?modo=propias                                                    -> cuentas de Instagram de las modelos
export async function GET(req: NextRequest) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const modo = req.nextUrl.searchParams.get("modo");
  const categoria = req.nextUrl.searchParams.get("categoria");
  const supabase = createAdminClient();

  if (modo === "referencias") {
    let q = supabase.from("referencias_cuentas").select("id, username, categoria").eq("activa", true).order("username");
    if (categoria && categoria !== "todas") q = q.eq("categoria", categoria);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      modo,
      ajustes: AJUSTES_POR_DEFECTO,
      cuentas: (data ?? []).map((c) => ({
        id: c.id,
        username: String(c.username).replace(/^@/, ""),
        categoria: c.categoria ?? "general",
        etiqueta: c.categoria ?? "general",
      })),
    });
  }

  if (modo === "propias") {
    const { data, error } = await supabase
      .from("cuentas_instagram")
      .select("*, modelos(nombre, activa)")
      .eq("activa", true)
      .order("username");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    type Fila = { id: string; username: string; url?: string | null; red_social?: string | null; modelos?: { nombre?: string | null; activa?: boolean | null } | null };
    const cuentas = ((data ?? []) as unknown as Fila[])
      .filter((c) => (c.red_social ? c.red_social === "instagram" : !c.url || /instagram\.com/i.test(c.url)) && c.modelos?.activa !== false)
      .map((c) => ({ id: c.id, username: String(c.username).replace(/^@/, ""), categoria: null, etiqueta: c.modelos?.nombre ?? "" }));
    return NextResponse.json({ modo, ajustes: AJUSTES_POR_DEFECTO, cuentas });
  }

  return NextResponse.json({ error: "modo debe ser referencias o propias" }, { status: 400 });
}
