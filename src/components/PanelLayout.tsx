import { Sidebar } from "@/components/Sidebar";
import { getDemoApprovalCount } from "@/lib/demo-approvals";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

async function getApprovalCount() {
  if (!canUseSupabase()) {
    return getDemoApprovalCount();
  }
  try {
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

export async function PanelLayout({ children }: { children: React.ReactNode }) {
  const approvalCount = await getApprovalCount();

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Sidebar pendingAprobacion={approvalCount} />
      <main className="px-4 py-6 md:ml-[224px] md:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
