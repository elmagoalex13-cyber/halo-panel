import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { sampleVaultEntries } from "@/lib/data";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { VaultEntry } from "@/types";
import { VaultClient } from "./VaultClient";

async function loadVaultEntries() {
  if (!canUseSupabase()) return sampleVaultEntries;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("vault_panel")
      .select("id,nombre,categoria,descripcion,modelo_id,created_at")
      .order("categoria")
      .order("nombre");

    return ((data ?? []) as VaultEntry[]).length ? (data as VaultEntry[]) : sampleVaultEntries;
  } catch {
    return sampleVaultEntries;
  }
}

export default async function VaultPage() {
  const entries = await loadVaultEntries();

  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">Credenciales cifradas AES-256-GCM</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Vault</h1>
      </div>
      <GlassCard className="p-5">
        <VaultClient entries={entries} />
      </GlassCard>
    </PanelLayout>
  );
}
