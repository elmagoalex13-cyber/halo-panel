// «Onboarding recibido»: cuando una modelo envia su onboarding queda como pendiente de revisar hasta que alguien abre ese onboarding en su ficha.
// Se guarda en panel_config (clave onboarding_vistos: modelo -> hasta que envio se ha visto), con «comparar y cambiar». Si ella lo vuelve a enviar, vuelve a salir.
import { createAdminClient } from "@/lib/supabase/server";
import { soloVisibles, type Alcance } from "@/lib/alcance";

const CLAVE = "onboarding_vistos";

export async function leerOnboardingVistos(): Promise<Record<string, string>> {
  try {
    const { data } = await createAdminClient().from("panel_config").select("value").eq("key", CLAVE).maybeSingle();
    return ((data?.value as Record<string, string> | null) ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Marca el onboarding enviado el `enviadoAt` como revisado. */
export async function marcarOnboardingVisto(modeloId: string, enviadoAt: string): Promise<void> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("panel_config").select("value, updated_at").eq("key", CLAVE).maybeSingle();
    const actual = ((data?.value as Record<string, string> | null) ?? {}) as Record<string, string>;
    if (actual[modeloId] && new Date(actual[modeloId]).getTime() >= new Date(enviadoAt).getTime()) return; // ya estaba
    const nuevo = { ...actual, [modeloId]: enviadoAt };
    const ahora = new Date().toISOString();
    if (!data) {
      const { error } = await db.from("panel_config").insert({ key: CLAVE, value: nuevo, updated_at: ahora });
      if (!error) return;
    } else {
      const { data: ok, error } = await db.from("panel_config").update({ value: nuevo, updated_at: ahora }).eq("key", CLAVE).eq("updated_at", data.updated_at).select("key");
      if (!error && ok?.length) return;
    }
  }
}

export type OnboardingPendiente = { modelo_id: string; nombre: string; enviado_at: string };

/** Onboardings enviados que aun nadie ha abierto (de las modelos que esta persona puede ver). */
export async function onboardingsSinRevisar(alcance: Alcance): Promise<OnboardingPendiente[]> {
  try {
    const db = createAdminClient();
    const [{ data: filas }, vistos] = await Promise.all([
      soloVisibles(db.from("modelo_onboarding").select("modelo_id, enviado_at").eq("estado", "enviado").not("enviado_at", "is", null), alcance),
      leerOnboardingVistos(),
    ]);
    const pendientes = ((filas ?? []) as Array<{ modelo_id: string; enviado_at: string }>).filter((f) => !vistos[f.modelo_id] || new Date(vistos[f.modelo_id]).getTime() < new Date(f.enviado_at).getTime());
    if (!pendientes.length) return [];
    const { data: modelos } = await db.from("modelos").select("id, nombre").in("id", pendientes.map((p) => p.modelo_id)).eq("activa", true).is("eliminada_at", null);
    const nombre = new Map((modelos ?? []).map((m) => [m.id as string, m.nombre as string]));
    return pendientes.filter((p) => nombre.has(p.modelo_id)).map((p) => ({ ...p, nombre: nombre.get(p.modelo_id) as string })).sort((a, b) => b.enviado_at.localeCompare(a.enviado_at));
  } catch {
    return [];
  }
}
