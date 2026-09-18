import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { FrasesClient } from "./FrasesClient";

export const metadata = { title: "Banco de Frases" };
export const revalidate = 0;

export default async function FrasesPage() {
  if (!canUseSupabase()) return <PanelLayout><FrasesClient frases={[]} /></PanelLayout>;

  const supabase = createAdminClient();
  const { data } = await supabase.from("banco_frases_canciones").select("*").order("puntuacion", { ascending: false });
  return <PanelLayout><FrasesClient frases={data ?? []} /></PanelLayout>;
}
