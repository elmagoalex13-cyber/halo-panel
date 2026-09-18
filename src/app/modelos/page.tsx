import { PanelLayout } from "@/components/PanelLayout";
import { ModelosClient } from "./ModelosClient";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { CreatorConfig, CuentaInstagram, Modelo } from "@/types";

export const dynamic = "force-dynamic";

async function loadModelos() {
  const vacio = {
    modelos: [] as Modelo[],
    cuentas: [] as CuentaInstagram[],
    creatorConfigs: [] as CreatorConfig[],
    pipelineByModelo: {} as Record<string, number>,
  };
  if (!canUseSupabase()) return vacio;

  try {
    const supabase = createAdminClient();
    const [modelosResult, cuentasResult, creatorConfigsResult, pipelineResult] = await Promise.all([
      supabase.from("modelos").select("*").order("nombre"),
      supabase.from("cuentas_instagram").select("*").order("username"),
      supabase.from("creator_configs").select("*"),
      supabase.from("library_content").select("modelo_id, estado").limit(5000),
    ]);
    const pipelineByModelo: Record<string, number> = {};
    ((pipelineResult.data ?? []) as Array<{ modelo_id: string; estado: string }>).forEach((row) => {
      if (!["aprobado", "publicado", "rechazado", "archivado"].includes(row.estado)) {
        pipelineByModelo[row.modelo_id] = (pipelineByModelo[row.modelo_id] || 0) + 1;
      }
    });
    return {
      modelos: (modelosResult.data ?? []) as Modelo[],
      cuentas: (cuentasResult.data ?? []) as CuentaInstagram[],
      creatorConfigs: (creatorConfigsResult.data ?? []) as CreatorConfig[],
      pipelineByModelo,
    };
  } catch {
    return vacio;
  }
}

export default async function ModelosPage() {
  const { modelos, cuentas, creatorConfigs, pipelineByModelo } = await loadModelos();

  return (
    <PanelLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Grid de cards y perfiles</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Modelos</h1>
        </div>
      </div>
      <ModelosClient modelos={modelos} cuentas={cuentas} creatorConfigs={creatorConfigs} pipelineByModelo={pipelineByModelo} />
    </PanelLayout>
  );
}
