import { PanelLayout } from "@/components/PanelLayout";
import { ModelosClient } from "./ModelosClient";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { alcanceActual, soloVisibles } from "@/lib/alcance";
import type { CuentaInstagram, Modelo } from "@/types";

export const dynamic = "force-dynamic";

async function loadModelos() {
  const vacio = {
    modelos: [] as Modelo[],
    cuentas: [] as CuentaInstagram[],
    fotoByModelo: {} as Record<string, number>,
    pipelineByModelo: {} as Record<string, number>,
    onboardingByModelo: {} as Record<string, "borrador" | "enviado">,
    esDueno: false,
    papelera: [] as Modelo[],
  };
  if (!canUseSupabase()) return vacio;

  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    const [modelosResult, cuentasResult, pipelineResult, onboardingResult, fotoByModelo] = await Promise.all([
      soloVisibles(supabase.from("modelos").select("*").order("nombre"), alcance, "id"),
      soloVisibles(supabase.from("cuentas_instagram").select("*").order("username"), alcance),
      soloVisibles(supabase.from("library_content").select("modelo_id, estado").limit(5000), alcance),
      soloVisibles(supabase.from("modelo_onboarding").select("modelo_id, estado"), alcance),
      versionesFotos(),
    ]);
    // Papelera: solo la ve el dueño
    let papelera: Modelo[] = [];
    if (alcance.dueno) {
      const { data, error } = await supabase.from("modelos").select("*").not("eliminada_at", "is", null).order("eliminada_at", { ascending: false });
      if (!error) papelera = (data ?? []) as Modelo[];
    }
    const onboardingByModelo: Record<string, "borrador" | "enviado"> = {};
    ((onboardingResult.data ?? []) as Array<{ modelo_id: string; estado: string }>).forEach((row) => {
      onboardingByModelo[row.modelo_id] = row.estado === "enviado" ? "enviado" : "borrador";
    });
    const pipelineByModelo: Record<string, number> = {};
    ((pipelineResult.data ?? []) as Array<{ modelo_id: string; estado: string }>).forEach((row) => {
      if (!["aprobado", "publicado", "rechazado", "archivado"].includes(row.estado)) {
        pipelineByModelo[row.modelo_id] = (pipelineByModelo[row.modelo_id] || 0) + 1;
      }
    });
    return {
      modelos: (modelosResult.data ?? []) as Modelo[],
      cuentas: (cuentasResult.data ?? []) as CuentaInstagram[],
      fotoByModelo,
      pipelineByModelo,
      onboardingByModelo,
      esDueno: alcance.dueno,
      papelera,
    };
  } catch {
    return vacio;
  }
}

export default async function ModelosPage() {
  const { modelos, cuentas, pipelineByModelo, onboardingByModelo, fotoByModelo, esDueno, papelera } = await loadModelos();

  return (
    <PanelLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Grid de cards y perfiles</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Modelos</h1>
        </div>
      </div>
      <ModelosClient modelos={modelos} cuentas={cuentas} pipelineByModelo={pipelineByModelo} onboardingByModelo={onboardingByModelo} fotoByModelo={fotoByModelo} esDueno={esDueno} papelera={papelera} />
    </PanelLayout>
  );
}
