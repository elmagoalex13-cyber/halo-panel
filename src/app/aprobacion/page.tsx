import { PanelLayout } from "@/components/PanelLayout";
import { sampleModelos, sampleCuentasInstagram } from "@/lib/data";
import { getDemoVideos } from "@/lib/demo-approvals";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { MesaClient, type VideoRow } from "./MesaClient";
import { TrialReelsMesa } from "./TrialReelsMesa";
import type { LibraryContent } from "@/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  estado?: string;
  tab?: string;
};

const ESTADOS_VALIDOS = ["en_aprobacion", "aprobado", "editando"] as const;
type ApprovalEstado = (typeof ESTADOS_VALIDOS)[number];

type SupabaseApprovalRow = {
  id: string;
  titulo: string | null;
  tipo_video: string | null;
  estado: string;
  recibido_at: string;
  publicado_at: string | null;
  r2_key: string | null;
  r2_key_referencia: string | null;
  r2_key_original?: string | null;
  caption: string | null;
  frase_quemada: string | null;
  correcciones: string | null;
  modelo?: { nombre?: string | null } | null;
  cuenta?: { username?: string | null } | null;
};

function resolveEstado(value: string | undefined): ApprovalEstado {
  return ESTADOS_VALIDOS.includes(value as ApprovalEstado) ? (value as ApprovalEstado) : "en_aprobacion";
}

async function demoRows(estado: ApprovalEstado): Promise<VideoRow[]> {
  const videos = await getDemoVideos();
  const rawByModelo = new Map<string, LibraryContent>();
  videos
    .filter((video) => video.r2_key.startsWith("bruto/"))
    .forEach((video) => rawByModelo.set(video.modelo_id, video));

  return videos
    .filter((video) => video.estado === estado)
    .map((video) => ({
      id: video.id,
      titulo: video.filename_original,
      tipo_video: video.tipo_video,
      estado: video.estado,
      recibido_at: video.recibido_at,
      r2_key: video.signed_url ?? video.r2_key ?? null,
      r2_key_referencia: null,
      r2_key_original: rawByModelo.get(video.modelo_id)?.signed_url ?? rawByModelo.get(video.modelo_id)?.r2_key ?? null,
      caption: "caption" in video && typeof video.caption === "string" ? video.caption : "",
      frase_quemada:
        "frase_quemada" in video && typeof video.frase_quemada === "string" ? video.frase_quemada : video.notas_editor ?? "",
      correcciones: "correcciones" in video && typeof video.correcciones === "string" ? video.correcciones : "",
      modelo_nombre: video.modelo_nombre,
      cuenta_username: null,
    }));
}

async function getRows(estado: ApprovalEstado): Promise<VideoRow[]> {
  if (!canUseSupabase()) return demoRows(estado);

  try {
    const supabase = createAdminClient();
    const primary = await supabase
      .from("library_content")
      .select(`
        id, titulo, tipo_video, estado, recibido_at, publicado_at,
        r2_key, r2_key_referencia, r2_key_original, caption, frase_quemada, correcciones,
        modelo:modelos(nombre),
        cuenta:cuentas_instagram(username)
      `)
      .eq("estado", estado)
      .order("recibido_at", { ascending: false })
      .limit(80);

    let data = primary.data as unknown[] | null;
    let error = primary.error;

    if (error) {
      const retry = await supabase
        .from("library_content")
        .select(`
          id, titulo, tipo_video, estado, recibido_at, publicado_at,
          r2_key, r2_key_referencia, caption, frase_quemada, correcciones,
          modelo:modelos(nombre),
          cuenta:cuentas_instagram(username)
        `)
        .eq("estado", estado)
        .order("recibido_at", { ascending: false })
        .limit(80);

      data = retry.data as unknown[] | null;
      error = retry.error;
    }

    if (error) throw error;

    return ((data ?? []) as unknown as SupabaseApprovalRow[]).map((row) => ({
      id: row.id,
      titulo: row.titulo,
      tipo_video: row.tipo_video,
      estado: row.estado,
      recibido_at: row.recibido_at,
      r2_key: row.r2_key ?? null,
      r2_key_referencia: row.r2_key_referencia ?? null,
      r2_key_original: row.r2_key_original ?? null,
      caption: row.caption ?? "",
      frase_quemada: row.frase_quemada ?? "",
      correcciones: row.correcciones ?? "",
      modelo_nombre: row.modelo?.nombre ?? "—",
      cuenta_username: row.cuenta?.username ?? null,
    }));
  } catch {
    return demoRows(estado);
  }
}

async function getModelosYCuentas() {
  if (!canUseSupabase()) return { modelos: sampleModelos, cuentas: sampleCuentasInstagram };
  try {
    const supabase = createAdminClient();
    const [{ data: modelos }, { data: cuentas }] = await Promise.all([
      supabase.from("modelos").select("id, nombre").eq("activa", true).order("nombre"),
      supabase.from("cuentas_instagram").select("id, username, modelo_id").order("username"),
    ]);
    return {
      modelos: (modelos ?? []) as { id: string; nombre: string }[],
      cuentas: (cuentas ?? []) as { id: string; username: string; modelo_id: string }[],
    };
  } catch {
    return { modelos: sampleModelos, cuentas: sampleCuentasInstagram };
  }
}

export default async function AprobacionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tab = params.tab === "trial" ? "trial" : "reels";
  const estado = resolveEstado(params.estado);
  const [rows, { modelos, cuentas }] = await Promise.all([getRows(estado), getModelosYCuentas()]);

  const mainTabs = [
    { href: "/aprobacion?estado=en_aprobacion", estado: "en_aprobacion", label: "En aprobación" },
    { href: "/aprobacion?estado=aprobado", estado: "aprobado", label: "Aprobados" },
    { href: "/aprobacion?estado=editando", estado: "editando", label: "Rehacer IA" },
  ];

  return (
    <PanelLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-xl font-semibold text-halo-text">Mesa de Aprobación</h1>
          {/* Selector de sección principal */}
          <div className="flex gap-1 rounded-xl border border-halo-border bg-halo-muted/20 p-1">
            <a
              href="/aprobacion?tab=reels"
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === "reels" ? "bg-halo-accent text-white" : "text-halo-subtle hover:text-halo-text"}`}
            >
              Reels
            </a>
            <a
              href="/aprobacion?tab=trial"
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === "trial" ? "bg-halo-accent text-white" : "text-halo-subtle hover:text-halo-text"}`}
            >
              Trial Reels
            </a>
          </div>
        </div>

        {tab === "trial" ? (
          <TrialReelsMesa />
        ) : (
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
            <MesaClient rows={rows} currentEstado={estado} modelos={modelos} cuentas={cuentas} />
          </>
        )}
      </div>
    </PanelLayout>
  );
}
