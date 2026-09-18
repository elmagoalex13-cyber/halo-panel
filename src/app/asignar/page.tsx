import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { AsignarClient, type EncargoRow } from "./AsignarClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asignar vídeos" };

type Fila = {
  id: string;
  tipo_video: string;
  estado: string;
  instrucciones: string | null;
  created_at: string;
  modelo: { nombre: string } | null;
  referencia: { url_original: string | null; url_r2: string | null } | null;
};

async function cargar() {
  if (!canUseSupabase()) return { modelos: [], encargos: [] as EncargoRow[] };
  const supabase = createAdminClient();
  const [m, e] = await Promise.all([
    supabase.from("modelos").select("id, nombre").eq("activa", true).order("nombre"),
    supabase
      .from("encargos")
      .select("id, tipo_video, estado, instrucciones, created_at, modelo:modelos(nombre), referencia:referencias(url_original, url_r2)")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  const encargos = ((e.data ?? []) as unknown as Fila[]).map((f) => ({
    id: f.id,
    tipo: Number(f.tipo_video.replace(/\D/g, "")) || 4,
    estado: f.estado,
    instrucciones: f.instrucciones,
    creado: f.created_at,
    modelo: f.modelo?.nombre ?? "—",
    url: f.referencia?.url_original ?? null,
    descargado: Boolean(f.referencia?.url_r2),
  }));
  return { modelos: (m.data ?? []) as { id: string; nombre: string }[], encargos };
}

export default async function AsignarPage() {
  const { modelos, encargos } = await cargar();
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Lo que asignas aparece en el portal privado de cada modelo</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-white">Asignar vídeos</h1>
      </div>
      <AsignarClient modelos={modelos} encargos={encargos} />
    </PanelLayout>
  );
}
