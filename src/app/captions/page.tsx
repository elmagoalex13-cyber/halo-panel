import { PanelLayout } from "@/components/PanelLayout";
import { CaptionsClient } from "./CaptionsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banco de captions" };

export default function CaptionsPage() {
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">OnlyFans · los textos que acompañan los posts</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Banco de captions</h1>
      </div>
      <CaptionsClient />
    </PanelLayout>
  );
}
