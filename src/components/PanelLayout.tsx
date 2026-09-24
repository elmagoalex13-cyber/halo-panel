import { after } from "next/server";
import { programarPendientes, publerActivo } from "@/lib/publer";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { Sidebar } from "@/components/Sidebar";
import { syncRunnerResultados } from "@/lib/runnerSync";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

async function getApprovalCount() {
  if (!canUseSupabase()) return 0;
  try {
    await syncRunnerResultados();
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("library_content")
      .select("id", { count: "exact", head: true })
      .eq("estado", "en_aprobacion");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getNewLeadsCount() {
  if (!canUseSupabase()) return 0;
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("estado", "nuevo");
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function PanelLayout({ children }: { children: React.ReactNode }) {
  const [approvalCount, newLeadsCount] = await Promise.all([getApprovalCount(), getNewLeadsCount()]);
  // Aprobadas sin programar (p. ej. de antes de activar Publer): se programan en segundo plano
  if (publerActivo() && canUseSupabase()) after(() => programarPendientes(createAdminClient()));

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <RealtimeRefresh fallbackSegundos={8} />
      <Sidebar pendingAprobacion={approvalCount} pendingLeads={newLeadsCount} />
      <main className="min-w-0 px-3 py-4 pb-28 sm:px-4 sm:py-6 md:ml-[224px] md:px-8 md:pb-6 lg:px-10">
        <div className="mx-auto max-w-7xl min-w-0">{children}</div>
      </main>
    </div>
  );
}
