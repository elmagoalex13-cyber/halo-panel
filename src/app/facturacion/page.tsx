import { PanelLayout } from "@/components/PanelLayout";
import { FacturacionClient } from "./FacturacionClient";
import { VenuzSyncButton } from "./VenuzSyncButton";
import { VenuzResumen, type ModeloLite, type VenuzCuenta, type VenuzDia, type VenuzMes } from "./VenuzResumen";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { alcanceActual, cuentasVenuzVisibles, soloEn, soloVisibles } from "@/lib/alcance";
import type { FacturacionModelo, Modelo } from "@/types";

export const dynamic = "force-dynamic";

type BillingWithModel = FacturacionModelo & { modelos?: { nombre?: string | null } | null };
type UltimaSync = { created_at: string; resultado: string; detalle: { problemas?: string[]; error?: string } | null } | null;

const VACIO = {
  esDueno: false,
  rows: [] as FacturacionModelo[],
  modelos: [] as Modelo[],
  cuentas: [] as VenuzCuenta[],
  diarios: [] as VenuzDia[],
  meses: [] as VenuzMes[],
  modelosLite: [] as ModeloLite[],
  lastSync: null as UltimaSync,
};

// PostgREST devuelve numeric como numero o como texto segun la version: se normaliza.
function numerico<T extends Record<string, unknown>>(fila: T, campos: string[]): T {
  const copia: Record<string, unknown> = { ...fila };
  for (const c of campos) if (c in copia) copia[c] = Number(copia[c] ?? 0);
  return copia as T;
}

const CAMPOS_DIA = [
  "suscripciones", "mensajes", "tips", "posts", "referidos", "streams", "total",
  "suscripciones_bruto", "mensajes_bruto", "tips_bruto", "posts_bruto", "referidos_bruto", "streams_bruto", "total_bruto",
];

async function loadData() {
  if (!canUseSupabase()) return VACIO;

  try {
    const supabase = createAdminClient();
    const alcance = await alcanceActual();
    const cuentasOk = await cuentasVenuzVisibles(alcance);
    const [billingResult, modelosResult, cuentasResult, diariosResult, mesesResult, syncResult, fotos] = await Promise.all([
      soloVisibles(supabase.from("facturacion_modelos").select("*, modelos(nombre)").order("periodo_inicio", { ascending: false }), alcance),
      soloVisibles(supabase.from("modelos").select("*").order("nombre"), alcance, "id"),
      soloEn(supabase.from("venuz_cuentas").select("id, nombre, username, avatar_url, modelo_id, activa, estado_conexion, suscriptores").order("nombre"), cuentasOk, "id"),
      soloEn(supabase.from("venuz_ingresos_diarios").select("*").order("fecha", { ascending: false }).limit(20000), cuentasOk, "cuenta_id"),
      soloEn(supabase.from("venuz_resumen_mensual").select("*").order("mes", { ascending: false }).limit(500), cuentasOk, "cuenta_id"),
      supabase.from("log_agentes").select("created_at, resultado, detalle").eq("agente", "venuz_sync").eq("accion", "sync").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      versionesFotos(),
    ]);

    const rows = ((billingResult.data ?? []) as BillingWithModel[]).map((row) => ({
      ...row,
      modelo_nombre: row.modelos?.nombre ?? row.modelo_nombre ?? "Sin modelo",
    })) as FacturacionModelo[];
    const modelos = (modelosResult.data ?? []) as Modelo[];
    // Cada cuenta de Venuz hereda el ambito de su modelo (las sin vincular cuentan como solo del dueño)
    const ambitoPorModelo = new Map(modelos.map((m) => [m.id, m.ambito === "compartido" ? "compartido" : "privado"] as const));
    const cuentasVenuz = ((cuentasResult.data ?? []) as VenuzCuenta[]).map((c) => ({ ...c, ambito: c.modelo_id ? (ambitoPorModelo.get(c.modelo_id) ?? "privado") : "privado" }));

    return {
      esDueno: alcance.dueno,
      rows,
      modelos,
      cuentas: cuentasVenuz as VenuzCuenta[],
      diarios: ((diariosResult.data ?? []) as VenuzDia[]).map((d) => numerico(d, CAMPOS_DIA)),
      meses: ((mesesResult.data ?? []) as VenuzMes[]).map((m) => numerico(m, ["total_neto", "total_bruto", "reembolsos"])),
      modelosLite: modelos.map((m) => ({ id: m.id, nombre: m.nombre, foto: fotos[m.id] ?? null })),
      lastSync: (syncResult.data ?? null) as UltimaSync,
    };
  } catch {
    return VACIO;
  }
}

export default async function FacturacionPage() {
  const { rows, modelos, cuentas, diarios, meses, modelosLite, lastSync, esDueno } = await loadData();
  const syncOk = lastSync?.resultado === "ok" && !lastSync.detalle?.problemas?.length;

  return (
    <PanelLayout>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Ingresos por modelo y por canal</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Facturación</h1>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-sm text-[color:var(--text-secondary)]">Sincronizado desde Venuz.ai cada pocas horas</p>
            {lastSync ? (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${syncOk ? "border-green-500/30 text-green-400" : "border-amber-500/30 text-amber-400"}`}>
                {syncOk ? "✓" : "⚠"} último sync {new Date(lastSync.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </div>
        </div>
        <VenuzSyncButton />
      </div>

      <VenuzResumen cuentas={cuentas} diarios={diarios} meses={meses} modelos={modelosLite} ultimaSync={lastSync} esDueno={esDueno} />

      <div className="mb-4 mt-12">
        <h2 className="font-display text-2xl font-semibold text-white">Cobros y comisiones</h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">Registro manual de lo que se paga a cada modelo.</p>
      </div>
      <FacturacionClient rows={rows} modelos={modelos} />
    </PanelLayout>
  );
}
