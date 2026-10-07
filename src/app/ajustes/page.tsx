import { PanelLayout } from "@/components/PanelLayout";
import { AjustesClient } from "./AjustesClient";
import { sesionPanelActual } from "@/lib/panelUsuarios";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const sesion = await sesionPanelActual();
  return <PanelLayout><AjustesClient esDueno={sesion?.dueno ?? false} /></PanelLayout>;
}
