import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { FrasesClient } from "./FrasesClient";

export const metadata = { title: "Banco de Frases" };
export const revalidate = 0;

const sampleFrases = [
  {
    id: "frase-demo-1",
    frase: "Hoy no compito, aparezco.",
    cancion_nombre: "Midnight City",
    cancion_artista: "M83",
    audio_id_ig: null,
    origen: "manual",
    puntuacion: 9,
    veces_usada: 3,
    activa: true,
  },
  {
    id: "frase-demo-2",
    frase: "El plano bueno siempre llega tarde.",
    cancion_nombre: "Sweet Disposition",
    cancion_artista: "The Temper Trap",
    audio_id_ig: null,
    origen: "manual",
    puntuacion: 7,
    veces_usada: 1,
    activa: true,
  },
];

export default async function FrasesPage() {
  if (!canUseSupabase()) return <PanelLayout><FrasesClient frases={sampleFrases} /></PanelLayout>;

  const supabase = createAdminClient();
  const { data } = await supabase.from("banco_frases_canciones").select("*").order("puntuacion", { ascending: false });
  return <PanelLayout><FrasesClient frases={data ?? sampleFrases} /></PanelLayout>;
}
