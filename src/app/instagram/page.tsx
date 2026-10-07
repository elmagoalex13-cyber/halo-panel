import Link from "next/link";
import { PanelLayout } from "@/components/PanelLayout";
import { CuentasTab } from "./CuentasTab";
import { ReferenciasTab } from "./ReferenciasTab";
import { IdeasViralesTab } from "./IdeasViralesTab";
import { ViralesPropiosTab, type ViralPropio } from "./ViralesPropiosTab";
import { versionesFotos } from "@/lib/fotosModelos";
import { loadCuentasIG, loadCuentasInstagramReales } from "@/lib/cuentasIG";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import type { Modelo, ReferenciaCuenta, ReferenciaVideo } from "@/types";
import { alcanceActual, ambitosModelos, soloVisibles } from "@/lib/alcance";

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
    const { data } = await soloVisibles(supabase.from("modelos").select("*").eq("activa", true).order("nombre"), await alcanceActual(), "id");
    return (data ?? []) as Modelo[];
  } catch {
    return [];
  }
}

type VideoWithCuenta = ReferenciaVideo & { referencias_cuentas?: { username?: string | null; categoria?: string | null } | null };

async function loadReferenciasVideos(): Promise<ReferenciaVideo[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("referencias_videos")
      .select("*, referencias_cuentas:cuenta_id(username,categoria)")
      .order("fecha_publicacion", { ascending: false });
    if (error) return [];
    return ((data ?? []) as VideoWithCuenta[]).map((row) => ({
      ...row,
      cuenta_username: row.referencias_cuentas?.username ?? undefined,
      cuenta_categoria: row.referencias_cuentas?.categoria ?? undefined,
    }));
  } catch {
    return [];
  }
}

async function loadViralesPropios(): Promise<ViralPropio[]> {
  if (!canUseSupabase()) return [];
  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    const [virales, cuentas, modelos, fotos] = await Promise.all([
      soloVisibles(supabase.from("virales_propios").select("*").order("fecha_publicacion", { ascending: false }).limit(2000), alcance),
      soloVisibles(supabase.from("cuentas_instagram").select("id, username, modelo_id"), alcance),
      soloVisibles(supabase.from("modelos").select("id, nombre"), alcance, "id"),
      versionesFotos(),
    ]);
    if (virales.error) return [];
    const cuentaPorId = new Map((cuentas.data ?? []).map((c) => [c.id as string, c]));
    const nombrePorId = new Map((modelos.data ?? []).map((m) => [m.id as string, m.nombre as string]));
    return (virales.data ?? []).map((v) => {
      const c = cuentaPorId.get(v.cuenta_id);
      const modeloId = (v.modelo_id ?? c?.modelo_id ?? null) as string | null;
      return {
        ...v,
        vistas: Number(v.vistas),
        likes: Number(v.likes),
        comentarios: Number(v.comentarios),
        compartidos: Number(v.compartidos),
        viral_score: v.viral_score === null ? null : Number(v.viral_score),
        mediana_cuenta: v.mediana_cuenta === null ? null : Number(v.mediana_cuenta),
        modelo_id: modeloId,
        username: (c?.username as string | undefined) ?? "?",
        modelo_nombre: modeloId ? (nombrePorId.get(modeloId) ?? "") : "",
        foto: modeloId ? (fotos[modeloId] ?? null) : null,
      } as ViralPropio;
    });
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
  const activeTab = tab === "referencias" ? "referencias" : tab === "ideas" ? "ideas" : tab === "propios" ? "propios" : "cuentas";
  const [cuentasReales, referenciasCuentas, referenciasVideos, modelosActivos, viralesPropios] = await Promise.all([
    loadCuentasInstagramReales(),
    loadReferencias(),
    loadReferenciasVideos(),
    loadModelosActivos(),
    loadViralesPropios(),
  ]);
  const cuentas = loadCuentasIG(cuentasReales);
  const { esDueno, porModelo } = await ambitosModelos();

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
        <Link
          href="/instagram?tab=propios"
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "propios" ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"
          }`}
        >
          Virales propios
        </Link>
      </div>

      {activeTab === "cuentas" ? (
        <CuentasTab cuentas={cuentas} esDueno={esDueno} ambitos={porModelo} />
      ) : activeTab === "referencias" ? (
        <ReferenciasTab cuentas={referenciasCuentas} />
      ) : activeTab === "propios" ? (
        <ViralesPropiosTab virales={viralesPropios} esDueno={esDueno} ambitos={porModelo} />
      ) : (
        <IdeasViralesTab videos={referenciasVideos} modelos={modelosActivos.map((m) => ({ id: m.id, nombre: m.nombre }))} />
      )}
    </PanelLayout>
  );
}
