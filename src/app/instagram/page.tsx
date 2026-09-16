import Link from "next/link";
import { PanelLayout } from "@/components/PanelLayout";
import { CuentasTab } from "./CuentasTab";
import { ReferenciasTab } from "./ReferenciasTab";
import { IdeasViralesTab } from "./IdeasViralesTab";
import { sampleBancoReferencias, sampleModelos, sampleReferenciasCuentas, sampleReferenciasVideos } from "@/lib/data";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { BancoReferenciaVideo, Modelo, ReferenciaCuenta, ReferenciaVideo } from "@/types";

export const dynamic = "force-dynamic";

async function loadReferencias(): Promise<ReferenciaCuenta[]> {
  if (!canUseSupabase()) return sampleReferenciasCuentas;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("referencias_cuentas").select("*").order("created_at", { ascending: false });
    return ((data ?? []) as ReferenciaCuenta[]).length ? (data as ReferenciaCuenta[]) : sampleReferenciasCuentas;
  } catch {
    return sampleReferenciasCuentas;
  }
}

async function loadBancoReferencias(): Promise<BancoReferenciaVideo[]> {
  if (!canUseSupabase()) return sampleBancoReferencias;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("banco_frases_canciones")
      .select(
        "id, cuenta_referencia_id, url_referencia, frase, cancion_nombre, cancion_artista, views_referencia, likes_referencia, fecha_publicacion_ref, origen, created_at, cuenta_referencia:referencias_cuentas(username)",
      )
      .order("views_referencia", { ascending: false })
      .limit(100);
    const rows = ((data ?? []) as unknown as Array<BancoReferenciaVideo & { cuenta_referencia?: { username?: string | null } | null }>).map(
      (row) => ({ ...row, cuenta_username: row.cuenta_referencia?.username ?? null }),
    );
    return rows;
  } catch {
    return sampleBancoReferencias;
  }
}

async function loadModelosActivos(): Promise<Modelo[]> {
  if (!canUseSupabase()) return sampleModelos;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("modelos").select("*").eq("activa", true).order("nombre");
    return ((data ?? []) as Modelo[]).length ? (data as Modelo[]) : sampleModelos;
  } catch {
    return sampleModelos;
  }
}

type VideoWithCuenta = ReferenciaVideo & { referencias_cuentas?: { username?: string | null } | null };

async function loadReferenciasVideos(): Promise<ReferenciaVideo[]> {
  if (!canUseSupabase()) return sampleReferenciasVideos;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("referencias_videos")
      .select("*, referencias_cuentas(username)")
      .order("fecha_publicacion", { ascending: false });
    const rows = ((data ?? []) as VideoWithCuenta[]).map((row) => ({
      ...row,
      cuenta_username: row.referencias_cuentas?.username ?? undefined,
    }));
    return rows.length ? rows : sampleReferenciasVideos;
  } catch {
    return sampleReferenciasVideos;
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
