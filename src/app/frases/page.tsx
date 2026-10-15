import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { FrasesClient } from "./FrasesClient";

export const metadata = { title: "Banco de Frases" };
export const revalidate = 0;

export default async function FrasesPage() {
  if (!canUseSupabase()) return <PanelLayout><FrasesClient frases={[]} conMusica={[]} /></PanelLayout>;

  const supabase = createAdminClient();
  const { data } = await supabase.from("banco_frases_canciones").select("*").order("puntuacion", { ascending: false });
  // Frases que ya tienen su musica (la lista la mantiene el editor al sacar el audio de los videos scrapeados)
  const { data: lista } = await supabase.from("panel_config").select("value").eq("key", "frases_con_audio").maybeSingle();
  const conMusica = ((lista?.value as { ids?: string[] } | null)?.ids ?? []) as string[];
  return <PanelLayout><FrasesClient frases={data ?? []} conMusica={conMusica} /></PanelLayout>;
}
