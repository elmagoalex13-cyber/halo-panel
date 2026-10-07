"use client";

import { useState } from "react";
import { SelectorAmbito, ambitoCoincide, type FiltroAmbito } from "@/components/SelectorAmbito";
import { VenuzResumen } from "./VenuzResumen";
import { FacturacionClient } from "./FacturacionClient";
import type { FacturacionModelo, Modelo } from "@/types";

type Props = {
  esDueno: boolean;
  rows: FacturacionModelo[];
  modelos: Modelo[];
  resumen: Omit<React.ComponentProps<typeof VenuzResumen>, "hayCuentas" | "grupoVacio">;
};

/** Un unico selector (Todo / Mis modelos / Con mi socio) que filtra a la vez el resumen de Venuz y los cobros. */
export function FacturacionPanel({ esDueno, rows, modelos, resumen }: Props) {
  const [filtro, setFiltro] = useState<FiltroAmbito>("todas");
  const ambitoModelo = (id: string | null | undefined) => modelos.find((m) => m.id === id)?.ambito;

  const cuentas = resumen.cuentas.filter((c) => ambitoCoincide(filtro, c.ambito));
  const ids = new Set(cuentas.map((c) => c.id));
  const diarios = filtro === "todas" ? resumen.diarios : resumen.diarios.filter((d) => ids.has(d.cuenta_id));
  const meses = filtro === "todas" ? resumen.meses : resumen.meses.filter((m) => ids.has(m.cuenta_id));
  const rowsGrupo = rows.filter((r) => ambitoCoincide(filtro, ambitoModelo(r.modelo_id)));
  const modelosGrupo = modelos.filter((m) => ambitoCoincide(filtro, m.ambito));

  return (
    <>
      <SelectorAmbito
        esDueno={esDueno}
        valor={filtro}
        onChange={setFiltro}
        cuenta={(f) => resumen.cuentas.filter((c) => ambitoCoincide(f, c.ambito)).length}
      />
      <VenuzResumen
        key={filtro}
        {...resumen}
        cuentas={cuentas}
        diarios={diarios}
        meses={meses}
        hayCuentas={resumen.cuentas.length > 0}
        grupoVacio={resumen.cuentas.length > 0 && cuentas.length === 0}
      />

      <div className="mb-4 mt-12">
        <h2 className="font-display text-2xl font-semibold text-white">Cobros y comisiones</h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">Registro manual de lo que se paga a cada modelo.</p>
      </div>
      <FacturacionClient rows={rowsGrupo} modelos={modelosGrupo} />
    </>
  );
}
