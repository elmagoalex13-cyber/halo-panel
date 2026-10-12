import { PanelLayout } from "@/components/PanelLayout";
import { CaptionsClient } from "./CaptionsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captions" };

export default function CaptionsPage() {
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Textos para acompañar los posts de OnlyFans</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-white">Captions</h1>
      </div>
      <CaptionsClient />
    </PanelLayout>
  );
}
