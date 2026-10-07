import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { tipoVideoEfectivo } from "@/lib/tipoVideo";
import { versionesFotos } from "@/lib/fotosModelos";
import { MesaClient, type VideoRow } from "./MesaClient";
import { alcanceActual, soloVisibles } from "@/lib/alcance";

export const dynamic = "force-dynamic";

type SearchParams = {
  estado?: string;
  tab?: string;
};

const ESTADOS_VALIDOS = ["en_aprobacion", "aprobado", "publicado", "editando"] as const;
type ApprovalEstado = (typeof ESTADOS_VALIDOS)[number];

type SupabaseApprovalRow = {
  id: string;
  modelo_id?: string | null;
  titulo: string | null;
  tipo_video: string | null;
  tipo?: number | null;
  estado: string;
  recibido_at: string;
  publicado_at: string | null;
  r2_key: string | null;
  r2_key_referencia: string | null;
  r2_key_original?: string | null;
  video_procesado_url?: string | null;
  estado_procesamiento?: string | null;
  error_mensaje?: string | null;
  caption: string | null;
  frase_quemada: string | null;
  correcciones: string | null;
  recorte_inicio?: number | null;
  recorte_fin?: number | null;
  modelo?: { nombre?: string | null } | null;
  cuenta?: { username?: string | null } | null;
};

type EditingStats = {
  processing: number;
  pending: number;
  errors: number;
};

function resolveEstado(value: string | undefined): ApprovalEstado {
  return ESTADOS_VALIDOS.includes(value as ApprovalEstado) ? (value as ApprovalEstado) : "en_aprobacion";
}

async function getEditingStats(): Promise<EditingStats> {
  if (!canUseSupabase()) return { processing: 0, pending: 0, errors: 0 };

  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    const [processing, pending, errors] = await Promise.all([
      soloVisibles(supabase
        .from("library_content")
        .select("id", { count: "exact", head: true })
        .eq("estado", "editando")
        .eq("estado_procesamiento", "procesando")
        .or("tipo.is.null,tipo.neq.5"), alcance),
      soloVisibles(supabase
        .from("library_content")
        .select("id", { count: "exact", head: true })
        .eq("estado", "editando")
        .eq("estado_procesamiento", "pendiente")
        .or("tipo.is.null,tipo.neq.5"), alcance),
      soloVisibles(supabase
        .from("library_content")
        .select("id", { count: "exact", head: true })
        .eq("estado", "editando")
        .eq("estado_procesamiento", "error")
        .or("tipo.is.null,tipo.neq.5"), alcance),
    ]);

    return {
      processing: processing.count ?? 0,
      pending: pending.count ?? 0,
      errors: errors.count ?? 0,
    };
  } catch {
    return { processing: 0, pending: 0, errors: 0 };
  }
}

async function getRows(estado: ApprovalEstado): Promise<VideoRow[]> {
  if (!canUseSupabase()) return [];

  try {
    const supabase = createAdminClient();
    const fotos = await versionesFotos();
    const alcance = await alcanceActual();
    const primary = await soloVisibles(supabase
      .from("library_content")
      .select(`
        id, modelo_id, titulo, tipo_video, tipo, estado, recibido_at, publicado_at,
        r2_key, r2_key_referencia, r2_key_original, video_procesado_url, estado_procesamiento, error_mensaje,
        caption, frase_quemada, correcciones, recorte_inicio, recorte_fin,
        modelo:modelos(nombre),
        cuenta:cuentas_instagram(username)
      `)
      .eq("estado", estado)
      .or("tipo.is.null,tipo.neq.5") // los trial reels automaticos no pasan por la Mesa
      .order("recibido_at", { ascending: false })
      .limit(80), alcance);

    const data = primary.data as unknown[] | null;
    const error = primary.error;

    if (error) throw error;

    return ((data ?? []) as unknown as SupabaseApprovalRow[]).map((row) => ({
      id: row.id,
      modelo_id: row.modelo_id ?? null,
      modelo_foto: row.modelo_id ? (fotos[row.modelo_id] ?? null) : null,
      titulo: row.titulo,
      tipo_video: tipoVideoEfectivo(row.tipo_video, row.tipo),
      estado: row.estado,
      recibido_at: row.recibido_at,
      r2_key: row.r2_key ?? null,
      r2_key_referencia: row.r2_key_referencia ?? null,
      r2_key_original: row.r2_key_original ?? null,
      video_procesado_url: row.video_procesado_url ?? null,
      estado_procesamiento: row.estado_procesamiento ?? null,
      error_mensaje: row.error_mensaje ?? null,
      programado_at: row.estado === "aprobado" || row.estado === "publicado" ? row.publicado_at : null,
      caption: row.caption ?? "",
      frase_quemada: row.frase_quemada ?? "",
      correcciones: row.correcciones ?? "",
      recorte_inicio: row.recorte_inicio ?? null,
      recorte_fin: row.recorte_fin ?? null,
      modelo_nombre: row.modelo?.nombre ?? "—",
      cuenta_username: row.cuenta?.username ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function AprobacionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const estado = resolveEstado(params.estado);
  const [rows, editingStats] = await Promise.all([getRows(estado), getEditingStats()]);

  const mainTabs = [
    { href: "/aprobacion?estado=en_aprobacion", estado: "en_aprobacion", label: "En aprobación" },
    { href: "/aprobacion?estado=aprobado", estado: "aprobado", label: "Aprobados (programados / para descargar)" },
    { href: "/aprobacion?estado=publicado", estado: "publicado", label: "Publicados" },
    { href: "/aprobacion?estado=editando", estado: "editando", label: "Rehacer IA" },
  ];

  return (
    <PanelLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-xl font-semibold text-halo-text">Mesa de Aprobación</h1>
          <div className="flex min-w-[230px] items-center justify-between gap-4 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-3 shadow-[0_18px_45px_rgba(34,211,238,0.08)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200/70">Editando ahora</p>
              <p className="mt-1 font-display text-2xl font-semibold text-white">{editingStats.processing}</p>
            </div>
            <div className="text-right text-xs text-white/55">
              <p><span className="font-semibold text-white/80">{editingStats.pending}</span> en cola</p>
              <p><span className="font-semibold text-red-200">{editingStats.errors}</span> con error</p>
            </div>
          </div>
        </div>

        <>
            <div className="flex flex-wrap gap-2 text-xs">
              {mainTabs.map((t) => (
                <a
                  key={t.estado}
                  href={t.href}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    estado === t.estado ? "bg-halo-accent/20 text-halo-accent border border-halo-accent/30" : "text-halo-subtle hover:text-halo-text"
                  }`}
                >
                  {t.label}
                </a>
              ))}
            </div>
            <MesaClient rows={rows} currentEstado={estado} />
        </>
      </div>
    </PanelLayout>
  );
}
