import { PanelLayout } from "@/components/PanelLayout";
import { AjustesClient } from "./AjustesClient";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const sesion = await sesionPanelActual();
  return (
    <PanelLayout>
      <div className="mb-8">
        <p className="text-sm text-[color:var(--text-secondary)]">Publicación y accesos</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Ajustes</h1>
      </div>
      <AjustesClient esDueno={sesion?.dueno ?? false} />
    </PanelLayout>
  );
}
