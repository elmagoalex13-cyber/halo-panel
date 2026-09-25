import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { Sidebar } from "@/components/Sidebar";

export function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <RealtimeRefresh fallbackSegundos={45} />
      <Sidebar />
      <main className="min-w-0 px-3 py-4 pb-28 sm:px-4 sm:py-6 md:ml-[224px] md:px-8 md:pb-6 lg:px-10">
        <div className="mx-auto max-w-7xl min-w-0">{children}</div>
      </main>
    </div>
  );
}
