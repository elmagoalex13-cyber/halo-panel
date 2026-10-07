import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// Lista ligera para el desplegable de la barra lateral (protegida por el middleware: solo admin).
export async function GET() {
  if (!canUseSupabase()) return NextResponse.json({ modelos: [] });
  try {
    const alcance = await alcanceActual();
    const [{ data }, fotos] = await Promise.all([
      soloVisibles(createAdminClient().from("modelos").select("id, nombre, activa, portal_token").order("nombre"), alcance, "id"),
      versionesFotos(),
    ]);
    return NextResponse.json({
      modelos: (data ?? []).map((m) => ({
        id: m.id as string,
        nombre: m.nombre as string,
        activa: m.activa !== false,
        portal_token: (m.portal_token as string | null) ?? null,
        foto: fotos[m.id as string] ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ modelos: [] });
  }
}
