import { PanelLayout } from "@/components/PanelLayout";
import { CaptionsClient } from "./CaptionsClient";
import { SubPaginas, subOnlyFans } from "@/components/SubPaginas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captions" };

export default function CaptionsPage() {
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Captions: los textos que acompañan los posts de OnlyFans</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">OnlyFans</h1>
      </div>
      <SubPaginas items={subOnlyFans("captions")} />
      <CaptionsClient />
    </PanelLayout>
  );
}
