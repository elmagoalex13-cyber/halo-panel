import { PanelLayout } from "@/components/PanelLayout";
import { FacturacionClient } from "./FacturacionClient";
import { VenuzSyncButton } from "./VenuzSyncButton";
import { sampleFacturacion, sampleModelos } from "@/lib/data";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { FacturacionModelo, Modelo } from "@/types";

export const dynamic = "force-dynamic";

type BillingWithModel = FacturacionModelo & { modelos?: { nombre?: string | null } | null };

async function loadData() {
  if (!canUseSupabase()) {
    return { rows: sampleFacturacion, modelos: sampleModelos, lastSync: null, lastSyncOk: false };
  }

  try {
    const supabase = createAdminClient();
    const [billingResult, modelosResult, lastSyncResult] = await Promise.all([
      supabase.from("facturacion_modelos").select("*, modelos(nombre)").order("periodo_inicio", { ascending: false }),
      supabase.from("modelos").select("*").order("nombre"),
      supabase.from("log_agentes").select("created_at, resultado").eq("agente", "venuz-sync").order("created_at", { ascending: false }).limit(1).single(),
    ]);

    const rows = ((billingResult.data ?? []) as BillingWithModel[]).map((row) => ({
      ...row,
      modelo_nombre: row.modelos?.nombre ?? row.modelo_nombre ?? "Sin modelo",
    })) as FacturacionModelo[];

    const modelos = ((modelosResult.data ?? []) as Modelo[]).length
      ? (modelosResult.data as Modelo[])
      : sampleModelos;

    return {
      rows: rows.length ? rows : sampleFacturacion,
      modelos,
      lastSync: lastSyncResult.data?.created_at ?? null,
      lastSyncOk: lastSyncResult.data?.resultado === "ok",
    };
  } catch {
    return { rows: sampleFacturacion, modelos: sampleModelos, lastSync: null, lastSyncOk: false };
  }
}

export default async function FacturacionPage() {
  const { rows, modelos, lastSync, lastSyncOk } = await loadData();

  return (
    <PanelLayout>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Tabla por modelo</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Facturación</h1>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-sm text-[color:var(--text-secondary)]">Sincronizado desde Venuz.ai</p>
            {lastSync ? (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${lastSyncOk ? "border-green-500/30 text-green-400" : "border-amber-500/30 text-amber-400"}`}>
                {lastSyncOk ? "✓" : "⚠"} último sync {new Date(lastSync).toLocaleDateString("es-ES")}
              </span>
            ) : null}
          </div>
        </div>
        <VenuzSyncButton />
      </div>
      <FacturacionClient rows={rows} modelos={modelos} />
    </PanelLayout>
  );
}
