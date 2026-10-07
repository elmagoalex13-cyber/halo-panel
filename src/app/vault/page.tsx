import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import type { VaultEntry } from "@/types";
import { VaultClient } from "./VaultClient";

export const dynamic = "force-dynamic";

async function loadModelos() {
  if (!canUseSupabase()) return [] as { id: string; nombre: string }[];
  const { data } = await createAdminClient().from("modelos").select("id, nombre").order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

// El dueño ve su baúl privado y el compartido. Cualquier otro usuario, SOLO el compartido; si la columna `ambito` aun
// no existe (falta el SQL 20261011) no ve nada.
async function loadVaultEntries(esDueno: boolean) {
  if (!canUseSupabase()) return { entries: [] as VaultEntry[], ambitoListo: false };

  try {
    const supabase = createAdminClient();
    const base = (campos: string) =>
      supabase.from("vault_panel").select(campos).not("nombre", "like", "portal:%").order("categoria").order("nombre");

    const conAmbito = await (esDueno ? base("id,nombre,categoria,descripcion,modelo_id,ambito,created_at") : base("id,nombre,categoria,descripcion,modelo_id,ambito,created_at").eq("ambito", "compartido"));
    if (!conAmbito.error) return { entries: (conAmbito.data ?? []) as unknown as VaultEntry[], ambitoListo: true };

    if (!esDueno) return { entries: [] as VaultEntry[], ambitoListo: false };
    const { data } = await base("id,nombre,categoria,descripcion,modelo_id,created_at");
    return { entries: ((data ?? []) as unknown as VaultEntry[]).map((e) => ({ ...e, ambito: "privado" as const })), ambitoListo: false };
  } catch {
    return { entries: [] as VaultEntry[], ambitoListo: false };
  }
}

export default async function VaultPage() {
  const sesion = await sesionPanelActual();
  const esDueno = sesion?.dueno ?? false;
  const [{ entries, ambitoListo }, modelos] = await Promise.all([loadVaultEntries(esDueno), loadModelos()]);

  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">Credenciales cifradas AES-256-GCM</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Vault</h1>
      </div>
      <GlassCard className="p-5">
        <VaultClient entries={entries} modelos={modelos} esDueno={esDueno} ambitoListo={ambitoListo} />
      </GlassCard>
    </PanelLayout>
  );
}
