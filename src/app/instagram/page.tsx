import { PanelLayout } from "@/components/PanelLayout";
import { CuentasTab } from "./CuentasTab";
import { ReferenciasTab } from "./ReferenciasTab";
import { IdeasViralesTab } from "./IdeasViralesTab";
import { ViralesPropiosTab, type ViralPropio } from "./ViralesPropiosTab";
import { HistoriasTab, type ResumenModeloHistorias } from "./HistoriasTab";
import { resumenHistorias } from "@/lib/historiasIG";
import { sesionPanelActual } from "@/lib/panelUsuarios";
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

/** Historias que han subido las modelos (solo las de las modelos visibles), con cuantas son nuevas para quien mira. */
async function loadHistorias(): Promise<ResumenModeloHistorias[]> {
  if (!canUseSupabase()) return [];
  try {
    const sesion = await sesionPanelActual();
    if (!sesion) return [];
    const alcance = await alcanceActual();
    const resumen = await resumenHistorias(alcance, sesion.usuario);
    if (!resumen.length) return [];
    const [modelos, fotos] = await Promise.all([
      soloVisibles(createAdminClient().from("modelos").select("id, nombre, ambito"), alcance, "id"),
      versionesFotos(),
    ]);
    const porId = new Map((modelos.data ?? []).map((m) => [m.id as string, m]));
    return resumen
      .filter((r) => porId.has(r.modeloId))
      .map((r) => ({ ...r, nombre: porId.get(r.modeloId)!.nombre as string, ambito: (porId.get(r.modeloId)!.ambito as string | null) ?? null, foto: fotos[r.modeloId] ?? null }));
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
  const activeTab = tab === "referencias" ? "referencias" : tab === "ideas" ? "ideas" : tab === "propios" ? "propios" : tab === "historias" ? "historias" : "cuentas";
  const [cuentasReales, referenciasCuentas, referenciasVideos, modelosActivos, viralesPropios, historias] = await Promise.all([
    loadCuentasInstagramReales(),
    loadReferencias(),
    loadReferenciasVideos(),
    loadModelosActivos(),
    loadViralesPropios(),
    loadHistorias(),
  ]);
  const cuentas = loadCuentasIG(cuentasReales);
  const { esDueno, porModelo } = await ambitosModelos();

  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Instagram · cuentas de la agencia y competencia</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">{{ cuentas: "Cuentas", referencias: "Cuentas de referencia", ideas: "Ideas virales", propios: "Virales propios", historias: "Historias" }[activeTab]}</h1>
      </div>

      {activeTab === "cuentas" ? (
        <CuentasTab cuentas={cuentas} esDueno={esDueno} ambitos={porModelo} />
      ) : activeTab === "referencias" ? (
        <ReferenciasTab cuentas={referenciasCuentas} />
      ) : activeTab === "historias" ? (
        <HistoriasTab resumen={historias} esDueno={esDueno} />
      ) : activeTab === "propios" ? (
        <ViralesPropiosTab virales={viralesPropios} esDueno={esDueno} ambitos={porModelo} />
      ) : (
        <IdeasViralesTab videos={referenciasVideos} modelos={modelosActivos.map((m) => ({ id: m.id, nombre: m.nombre }))} />
      )}
    </PanelLayout>
  );
}
