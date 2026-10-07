import { GlassCard } from "@/components/GlassCard";
import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { alcanceActual, soloVisibles } from "@/lib/alcance";
import type { VaultEntry } from "@/types";
import { VaultClient } from "./VaultClient";

export const dynamic = "force-dynamic";

async function loadModelos() {
  if (!canUseSupabase()) return [] as { id: string; nombre: string }[];
  const { data } = await soloVisibles(createAdminClient().from("modelos").select("id, nombre").order("nombre"), await alcanceActual(), "id");
  return (data ?? []) as { id: string; nombre: string }[];
}

// El dueño ve su baúl privado y el compartido. Cualquier otro usuario, SOLO el compartido; si la columna `ambito` aun
// no existe (falta el SQL 20261011) no ve nada. Lo que esta en la papelera no sale en la lista (solo el dueño lo ve aparte).
async function loadVaultEntries(esDueno: boolean) {
  const vacio = { entries: [] as VaultEntry[], ambitoListo: false, papelera: [] as VaultEntry[] };
  if (!canUseSupabase()) return vacio;

  try {
    const supabase = createAdminClient();
    const CAMPOS = "id,nombre,categoria,descripcion,modelo_id,ambito,created_at";
    const consulta = (campos: string, sinPapelera: boolean, soloCompartido: boolean) => {
      let q = supabase.from("vault_panel").select(campos).not("nombre", "like", "portal:%").order("categoria").order("nombre");
      if (sinPapelera) q = q.is("eliminada_at", null);
      if (soloCompartido) q = q.eq("ambito", "compartido");
      return q;
    };

    let r = await consulta(CAMPOS, true, !esDueno);
    if (r.error) r = await consulta(CAMPOS, false, !esDueno); // aun sin el SQL de la papelera
    let papelera: VaultEntry[] = [];
    if (esDueno) {
      const p = await supabase.from("vault_panel").select(`${CAMPOS},eliminada_at,eliminada_por`).not("eliminada_at", "is", null).not("nombre", "like", "portal:%").order("eliminada_at", { ascending: false });
      if (!p.error) papelera = (p.data ?? []) as unknown as VaultEntry[];
    }
    if (!r.error) return { entries: (r.data ?? []) as unknown as VaultEntry[], ambitoListo: true, papelera };

    if (!esDueno) return vacio;
    const { data } = await supabase.from("vault_panel").select("id,nombre,categoria,descripcion,modelo_id,created_at").not("nombre", "like", "portal:%").order("categoria").order("nombre");
    return { entries: ((data ?? []) as unknown as VaultEntry[]).map((e) => ({ ...e, ambito: "privado" as const })), ambitoListo: false, papelera };
  } catch {
    return vacio;
  }
}

export default async function VaultPage() {
  const sesion = await sesionPanelActual();
  const esDueno = sesion?.dueno ?? false;
  const [{ entries, ambitoListo, papelera }, modelos] = await Promise.all([loadVaultEntries(esDueno), loadModelos()]);

  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">Credenciales cifradas AES-256-GCM</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Vault</h1>
      </div>
      <GlassCard className="p-5">
        <VaultClient entries={entries} modelos={modelos} esDueno={esDueno} ambitoListo={ambitoListo} papelera={papelera} />
      </GlassCard>
    </PanelLayout>
  );
}
