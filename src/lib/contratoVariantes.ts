// Variantes del reparto del contrato (sin dependencias de servidor: lo usan el PDF, el email, la pagina de firma y el panel).
//  - "70-30": el contrato de siempre: 70 % agencia / 30 % creadora los primeros 6 meses y 60 / 40 desde el mes 7.
//  - "60-40": 60 % agencia / 40 % creadora desde el primer dia y durante todo el contrato (sin escalon).
import { CONTRATO_CLAUSULAS, type ClausulaContrato } from "@/lib/contratoTexto";

export type VarianteContrato = "70-30" | "60-40";
export const VARIANTES_CONTRATO: Array<{ id: VarianteContrato; etiqueta: string; corta: string }> = [
  { id: "70-30", etiqueta: "70 / 30 (pasa a 60 / 40 desde el mes 7)", corta: "70/30" },
  { id: "60-40", etiqueta: "60 / 40 desde el primer día", corta: "60/40" },
];
export const esVarianteContrato = (v: unknown): v is VarianteContrato => v === "70-30" || v === "60-40";

/** % para la agencia que se pone en la ficha de la modelo (lo usa la facturacion). */
export const porcentajeAgenciaDe = (v: VarianteContrato) => (v === "60-40" ? 60 : 70);

/** Las clausulas del contrato para esa variante. La 70-30 es el texto original tal cual; la 60-40 solo cambia el reparto de la clausula 2. */
export function clausulasDe(v: VarianteContrato): ClausulaContrato[] {
  if (v !== "60-40") return CONTRATO_CLAUSULAS;
  return CONTRATO_CLAUSULAS.map((c) => {
    if (c.n !== 2) return c;
    const bloques = [];
    let puesto = false;
    for (const b of c.bloques) {
      // Los tres bloques del escalon (primeros 6 meses / a partir del mes 7 / cambio automatico) se sustituyen por uno solo
      if (/^Primeros 6 meses/.test(b.negrita ?? "") || /^A partir del mes 7/.test(b.negrita ?? "") || /^El cambio de porcentaje/.test(b.texto)) {
        if (!puesto) {
          bloques.push({ tipo: "p" as const, negrita: "Durante toda la vigencia del contrato, desde la fecha de inicio efectivo:", texto: "60% para la Agencia / 40% para la Creadora." });
          puesto = true;
        }
        continue;
      }
      bloques.push(b);
    }
    return { ...c, bloques };
  });
}
