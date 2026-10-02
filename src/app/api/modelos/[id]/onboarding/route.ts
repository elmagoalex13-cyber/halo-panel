import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { onboardingATexto, sanearDatos } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

// GET /api/modelos/<id>/onboarding?formato=txt|json
//  txt  -> respuestas actuales en texto plano (descarga)
//  json -> respuestas actuales + TODO el historial de versiones (copia de seguridad)
// (Protegido por el middleware del panel: solo admin.)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const formato = req.nextUrl.searchParams.get("formato") === "json" ? "json" : "txt";

  const supabase = createAdminClient();
  const [{ data: modelo }, { data: actual }, { data: historial }] = await Promise.all([
    supabase.from("modelos").select("nombre").eq("id", id).maybeSingle(),
    supabase.from("modelo_onboarding").select("datos, estado, enviado_at, updated_at").eq("modelo_id", id).maybeSingle(),
    supabase.from("modelo_onboarding_historial").select("id, datos, origen, created_at").eq("modelo_id", id).order("created_at", { ascending: true }),
  ]);
  if (!actual) return NextResponse.json({ error: "Esta modelo aun no ha empezado el onboarding" }, { status: 404 });

  const nombre = modelo?.nombre ?? "modelo";
  const archivo = `onboarding-${nombre.replace(/[^\w.-]+/g, "_")}`;

  if (formato === "json") {
    return new NextResponse(JSON.stringify({ modelo: nombre, actual, historial: historial ?? [] }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${archivo}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(onboardingATexto(nombre, sanearDatos(actual.datos)), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${archivo}.txt"`,
      "Cache-Control": "private, no-store",
    },
  });
}
