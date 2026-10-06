import { PanelLayout } from "@/components/PanelLayout";
import { cargarResumenOF } from "@/lib/ofResumen";
import { OnlyFansClient } from "./OnlyFansClient";

export const dynamic = "force-dynamic";

export default async function OnlyFansPage({ searchParams }: { searchParams: Promise<{ modelo?: string }> }) {
  const { modelo } = await searchParams;
  const { listo, modelos, resumen } = await cargarResumenOF();
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Scripts, packs y posts de cada modelo, ordenados</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">OnlyFans</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Las modelos lo suben desde su portal (pestaña «Contenido») por fases, y aquí lo tienes listo para ver y descargar tal cual lo grabaron, sin perder calidad.
        </p>
      </div>
      {listo ? (
        <OnlyFansClient modelos={modelos} colecciones={resumen} modeloInicial={modelo} />
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200">
          Falta activar esta sección: ejecuta el SQL <code>20261008_onlyfans_contenido.sql</code> en el SQL Editor de Supabase y recarga.
        </div>
      )}
    </PanelLayout>
  );
}
