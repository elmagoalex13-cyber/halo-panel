import Link from "next/link";
import { PanelLayout } from "@/components/PanelLayout";
import { CuentasTab } from "./CuentasTab";
import { ReferenciasTab } from "./ReferenciasTab";
import { IdeasViralesTab } from "./IdeasViralesTab";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { BancoReferenciaVideo, Modelo, ReferenciaCuenta, ReferenciaVideo } from "@/types";

export const dynamic = "force-dynamic";

async function loadReferencias(): Promise<ReferenciaCuenta[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("referencias_cuentas").select("*").order("created_at", { ascending: false });
    return (data ?? []) as ReferenciaCuenta[];
  } catch {
    return [];
  }
}

type BancoRow = {
  id: string;
  cuenta_ref_id: string | null;
  url_original: string | null;
  thumbnail_url: string | null;
  descripcion: string | null;
  created_at: string | null;
  cuenta?: { username?: string | null } | null;
};

// Banco de referencias virales: tabla `referencias` (bot + manuales).
async function loadBancoReferencias(): Promise<BancoReferenciaVideo[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("referencias")
      .select("id, cuenta_ref_id, url_original, thumbnail_url, descripcion, created_at, cuenta:cuentas_referencia(username)")
      .eq("activa", true)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return [];
    return ((data ?? []) as unknown as BancoRow[]).map((row) => ({
      id: row.id,
      cuenta_referencia_id: row.cuenta_ref_id,
      cuenta_username: row.cuenta?.username ?? null,
      url_referencia: row.url_original,
      thumbnail_url: row.thumbnail_url,
      frase: row.descripcion,
      views_referencia: null,
      likes_referencia: null,
      origen: row.cuenta_ref_id ? "bot" : "manual",
      created_at: row.created_at,
    }));
  } catch {
    return [];
  }
}

async function loadModelosActivos(): Promise<Modelo[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("modelos").select("*").eq("activa", true).order("nombre");
    return (data ?? []) as Modelo[];
  } catch {
    return [];
  }
}

type VideoWithCuenta = ReferenciaVideo & { referencias_cuentas?: { username?: string | null } | null };

async function loadReferenciasVideos(): Promise<ReferenciaVideo[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("referencias_videos")
      .select("*, referencias_cuentas:cuenta_id(username)")
      .order("fecha_publicacion", { ascending: false });
    if (error) return [];
    return ((data ?? []) as VideoWithCuenta[]).map((row) => ({
      ...row,
      cuenta_username: row.referencias_cuentas?.username ?? undefined,
    }));
  } catch {
    return [];
  }
}

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "referencias" ? "referencias" : tab === "ideas" ? "ideas" : "cuentas";
  const [cuentasReales, referenciasCuentas, referenciasVideos, bancoReferencias, modelosActivos] = await Promise.all([
    loadCuentasInstagramReales(),
    loadReferencias(),
    loadReferenciasVideos(),
    loadBancoReferencias(),
    loadModelosActivos(),
  ]);
  const cuentas = loadCuentasIG(cuentasReales);

  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Cuentas de la agencia y competencia</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Instagram</h1>
      </div>

      <div className="mb-6 flex gap-2 border-b border-white/[0.08]">
        <Link
          href="/instagram?tab=cuentas"
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "cuentas" ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"
          }`}
        >
          Cuentas
        </Link>
        <Link
          href="/instagram?tab=referencias"
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "referencias" ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"
          }`}
        >
          Referencias
        </Link>
        <Link
          href="/instagram?tab=ideas"
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "ideas" ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"
          }`}
        >
          Ideas virales
        </Link>
      </div>

      {activeTab === "cuentas" ? (
        <CuentasTab cuentas={cuentas} />
      ) : activeTab === "referencias" ? (
        <ReferenciasTab cuentas={referenciasCuentas} bancoVideos={bancoReferencias} modelos={modelosActivos} />
      ) : (
        <IdeasViralesTab videos={referenciasVideos} />
      )}
    </PanelLayout>
  );
}
