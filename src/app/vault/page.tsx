import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { VaultEntry } from "@/types";
import { VaultClient } from "./VaultClient";

async function loadModelos() {
  if (!canUseSupabase()) return [] as { id: string; nombre: string }[];
  const { data } = await createAdminClient().from("modelos").select("id, nombre").order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

async function loadVaultEntries() {
  if (!canUseSupabase()) return [] as VaultEntry[];

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("vault_panel")
      .select("id,nombre,categoria,descripcion,modelo_id,created_at")
      .not("nombre", "like", "portal:%")
      .order("categoria")
      .order("nombre");

    return (data ?? []) as VaultEntry[];
  } catch {
    return [] as VaultEntry[];
  }
}

export default async function VaultPage() {
  const [entries, modelos] = await Promise.all([loadVaultEntries(), loadModelos()]);

  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">Credenciales cifradas AES-256-GCM</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Vault</h1>
      </div>
      <GlassCard className="p-5">
        <VaultClient entries={entries} modelos={modelos} />
      </GlassCard>
    </PanelLayout>
  );
}
