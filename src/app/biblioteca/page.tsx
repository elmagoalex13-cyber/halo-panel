import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { BibliotecaClient } from "./BibliotecaClient";
import { BibliotecaUploadBar } from "./BibliotecaUploadBar";
import { sampleModelos } from "@/lib/data";

export const dynamic = "force-dynamic";

type SearchParams = { estado?: string; modelo?: string; tipo?: string };

async function loadData(estado: string, modeloId: string, tipo: string) {
  if (!canUseSupabase()) {
    return {
      videos: [],
      modelos: sampleModelos.map((m) => ({ id: m.id, nombre: m.nombre })),
      totalCounts: { revisar: 0, etiquetado: 0, en_reparto: 0, all: 0 },
    };
  }

  try {
    const supabase = createAdminClient();

    const estadosMap: Record<string, string[]> = {
      revisar: ["recibido", "clasificando"],
      etiquetado: ["etiquetado"],
      en_reparto: ["en_reparto"],
      all: ["recibido", "clasificando", "etiquetado", "en_reparto"],
    };
    const estadosFiltro = estadosMap[estado] ?? estadosMap["all"];

    let query = supabase
      .from("library_content")
      .select(`
        id, titulo, tipo_video, estado, recibido_at, r2_key, r2_key_original,
        size_bytes, filename_original, clasificacion_ia,
        modelo:modelos(id, nombre),
        cuenta:cuentas_instagram(username)
      `)
      .in("estado", estadosFiltro)
      .order("recibido_at", { ascending: false })
      .limit(100);

    if (modeloId && modeloId !== "all") query = query.eq("modelo_id", modeloId);
    if (tipo && tipo !== "all") query = query.eq("tipo_video", tipo);

    const { data, error } = await query;
    if (error) throw error;

    const [modelosRes, countsRecibido, countsEtiquetado, countsReparto] = await Promise.all([
      supabase.from("modelos").select("id, nombre").eq("activa", true).order("nombre"),
      supabase.from("library_content").select("id", { count: "exact", head: true }).in("estado", ["recibido", "clasificando"]),
      supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "etiquetado"),
      supabase.from("library_content").select("id", { count: "exact", head: true }).eq("estado", "en_reparto"),
    ]);

    return {
      videos: (data ?? []) as unknown as BibliotecaVideo[],
      modelos: (modelosRes.data ?? []) as { id: string; nombre: string }[],
      totalCounts: {
        revisar: countsRecibido.count ?? 0,
        etiquetado: countsEtiquetado.count ?? 0,
        en_reparto: countsReparto.count ?? 0,
        all: (countsRecibido.count ?? 0) + (countsEtiquetado.count ?? 0) + (countsReparto.count ?? 0),
      },
    };
  } catch {
    return {
      videos: [],
      modelos: sampleModelos.map((m) => ({ id: m.id, nombre: m.nombre })),
      totalCounts: { revisar: 0, etiquetado: 0, en_reparto: 0, all: 0 },
    };
  }
}

export type BibliotecaVideo = {
  id: string;
  titulo: string | null;
  tipo_video: string | null;
  estado: string;
  recibido_at: string;
  r2_key: string | null;
  r2_key_original: string | null;
  size_bytes: number | null;
  filename_original: string | null;
  clasificacion_ia: { tipo?: string; confianza?: number; razon?: string } | null;
  modelo: { id: string; nombre: string } | null;
  cuenta: { username: string } | null;
};

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const estado = params.estado ?? "all";
  const modeloId = params.modelo ?? "all";
  const tipo = params.tipo ?? "all";

  const { videos, modelos, totalCounts } = await loadData(estado, modeloId, tipo);

  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Bandeja de entrada de material bruto</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-halo-text">Biblioteca</h1>
      </div>
      <BibliotecaUploadBar modelos={modelos} />
      <BibliotecaClient
        videos={videos}
        modelos={modelos}
        totalCounts={totalCounts}
        currentEstado={estado}
        currentModelo={modeloId}
        currentTipo={tipo}
      />
    </PanelLayout>
  );
}
