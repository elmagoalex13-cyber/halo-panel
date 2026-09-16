import { PanelLayout } from "@/components/PanelLayout";
import { AjustesClient } from "./AjustesClient";

export const metadata = { title: "Ajustes" };

export default function AjustesPage() {
  return <PanelLayout><AjustesClient /></PanelLayout>;
}
