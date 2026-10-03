import { PanelLayout } from "@/components/PanelLayout";
import { ModelosClient } from "./ModelosClient";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import type { CuentaInstagram, Modelo } from "@/types";

export const dynamic = "force-dynamic";

async function loadModelos() {
  const vacio = {
    modelos: [] as Modelo[],
    cuentas: [] as CuentaInstagram[],
    fotoByModelo: {} as Record<string, number>,
    pipelineByModelo: {} as Record<string, number>,
    onboardingByModelo: {} as Record<string, "borrador" | "enviado">,
  };
  if (!canUseSupabase()) return vacio;

  try {
    const supabase = createAdminClient();
    const [modelosResult, cuentasResult, pipelineResult, onboardingResult, fotoByModelo] = await Promise.all([
      supabase.from("modelos").select("*").order("nombre"),
      supabase.from("cuentas_instagram").select("*").order("username"),
      supabase.from("library_content").select("modelo_id, estado").limit(5000),
      supabase.from("modelo_onboarding").select("modelo_id, estado"),
      versionesFotos(),
    ]);
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
    };
  } catch {
    return vacio;
  }
}

export default async function ModelosPage() {
  const { modelos, cuentas, pipelineByModelo, onboardingByModelo, fotoByModelo } = await loadModelos();

  return (
    <PanelLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Grid de cards y perfiles</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Modelos</h1>
        </div>
      </div>
      <ModelosClient modelos={modelos} cuentas={cuentas} pipelineByModelo={pipelineByModelo} onboardingByModelo={onboardingByModelo} fotoByModelo={fotoByModelo} />
    </PanelLayout>
  );
}
