import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { contarOFNuevo } from "@/lib/ofResumen";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { alcanceActual, soloVisibles } from "@/lib/alcance";
import { resumenHistorias } from "@/lib/historiasIG";
import { leerListasParaCuenta } from "@/lib/captacion";
import { onboardingsSinRevisar } from "@/lib/onboardingAvisos";
import { veModelo } from "@/lib/alcance";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ approval: 0, leads: 0, onlyfans: 0, actividad: 0, historias: 0, cuentas: 0, detalle: [] });
  }

  try {
    const supabase = createAdminClient();
    const sesion = await sesionPanelActual();
    const puedeLeads = !sesion?.denegadas.includes("leads");
    const puedeOF = !sesion?.denegadas.includes("onlyfans");
    // Acciones sensibles de tu socio que aun no has abierto (solo las ve el dueño; si falta el SQL 20261018, 0)
    const nuevasSensibles = sesion?.dueno
      ? supabase.from("panel_actividad").select("id", { count: "exact", head: true }).eq("sensible", true).is("vista_at", null)
      : Promise.resolve({ count: 0 });
    // Fotos de historias nuevas (de las modelos que esta persona puede ver); si R2 falla, 0
    const alcance = await alcanceActual();
    const historias = sesion ? resumenHistorias(alcance, sesion.usuario).then((r) => r.reduce((n, x) => n + x.nuevas, 0)).catch(() => 0) : Promise.resolve(0);
    const [approvalResult, leadsResult, of, actividad, historiasNuevas] = await Promise.all([
      soloVisibles(supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "en_aprobacion"), alcance),
      puedeLeads
        ? supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "nuevo")
        : Promise.resolve({ count: 0 }),
      puedeOF ? contarOFNuevo() : Promise.resolve({ count: 0, modelos: [] as string[] }),
      nuevasSensibles,
      historias,
    ]);

    // «Modelos»: QUE modelos tienen algo pendiente y por que (lista para su cuenta de Instagram / onboarding recibido sin abrir)
    const listasIds = (await leerListasParaCuenta()).filter((id) => veModelo(alcance, id));
    const onboardings = await onboardingsSinRevisar(alcance);
    const { data: nombresListas } = listasIds.length ? await supabase.from("modelos").select("id, nombre").in("id", listasIds) : { data: [] };
    const detalle = [
      ...(nombresListas ?? []).map((m) => ({ id: m.id as string, nombre: m.nombre as string, motivo: "cuenta" as const })),
      ...onboardings.map((o) => ({ id: o.modelo_id, nombre: o.nombre, motivo: "onboarding" as const })),
    ];

    return NextResponse.json({
      approval: approvalResult.count ?? 0,
      leads: leadsResult.count ?? 0,
      onlyfans: of.count,
      actividad: actividad.count ?? 0,
      historias: historiasNuevas,
      // Pendientes en «Modelos»: las que ya cumplen todos los minimos y aun no tienen cuenta de Instagram + los onboardings recibidos sin abrir
      cuentas: detalle.length,
      detalle, // quien es y por que (para el desplegable del contador y los puntitos de la lista de modelos)
    });
  } catch {
    return NextResponse.json({ approval: 0, leads: 0, onlyfans: 0, actividad: 0, historias: 0, cuentas: 0, detalle: [] });
  }
}
