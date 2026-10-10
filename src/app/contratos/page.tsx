import { PanelLayout } from "@/components/PanelLayout";
import { ContratosClient } from "./ContratosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contratos" };

export default function ContratosPage() {
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Para modelos nuevas, sin crearles el portal antes</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-white">Contratos</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/45">Rellena el nombre y la fecha, pon tu firma y envíaselo: ella lo lee y lo firma desde el móvil. Los que no se firman se pueden eliminar; los firmados se conservan.</p>
      </div>
      <ContratosClient />
    </PanelLayout>
  );
}
