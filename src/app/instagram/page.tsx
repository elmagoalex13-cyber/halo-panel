import Link from "next/link";
import { PanelLayout } from "@/components/PanelLayout";
import { CuentasTab } from "./CuentasTab";
import { ReferenciasTab } from "./ReferenciasTab";
import { IdeasViralesTab } from "./IdeasViralesTab";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { Modelo, ReferenciaCuenta, ReferenciaVideo } from "@/types";

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
  const [cuentasReales, referenciasCuentas, referenciasVideos, modelosActivos] = await Promise.all([
    loadCuentasInstagramReales(),
    loadReferencias(),
    loadReferenciasVideos(),
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
          Cuentas de referencia
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
        <ReferenciasTab cuentas={referenciasCuentas} />
      ) : (
        <IdeasViralesTab videos={referenciasVideos} modelos={modelosActivos.map((m) => ({ id: m.id, nombre: m.nombre }))} />
      )}
    </PanelLayout>
  );
}
