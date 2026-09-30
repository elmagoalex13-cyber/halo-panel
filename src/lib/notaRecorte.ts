// Interpreta instrucciones EXPLICITAS de recorte en la nota de "Rehacer", sin
// depender de ningun modelo de IA (texto libre arbitrario no se entiende:
// solo estos patrones concretos). Formatos soportados (no distingue mayusculas):
//   "inicio +1.5"   -> el video empezara 1.5s mas tarde que el recorte actual
//   "inicio -2"     -> el video empezara 2s antes
//   "fin +1"        -> el final se alarga 1s
//   "fin -0.5"      -> el final se recorta 0.5s antes
// Se pueden combinar ambas en la misma nota (en cualquier orden/lineas).
export type AjusteRecorte = { deltaInicio?: number; deltaFin?: number };

function parseNumero(raw: string): number | null {
  const limpio = raw.replace(",", ".").trim();
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function parseNotaRecorte(nota: string): AjusteRecorte | null {
  if (!nota) return null;
  const inicioMatch = nota.match(/inicio\s*[:=]?\s*([+-]?\s*\d+(?:[.,]\d+)?)/i);
  const finMatch = nota.match(/fin\s*[:=]?\s*([+-]?\s*\d+(?:[.,]\d+)?)/i);
  if (!inicioMatch && !finMatch) return null;

  const ajuste: AjusteRecorte = {};
  if (inicioMatch) {
    const n = parseNumero(inicioMatch[1].replace(/\s+/g, ""));
    if (n !== null) ajuste.deltaInicio = n;
  }
  if (finMatch) {
    const n = parseNumero(finMatch[1].replace(/\s+/g, ""));
    if (n !== null) ajuste.deltaFin = n;
  }
  return ajuste.deltaInicio !== undefined || ajuste.deltaFin !== undefined ? ajuste : null;
}

/** Aplica el ajuste sobre el recorte actual (puede ser null si aun no se ha procesado nunca). */
export function aplicarAjusteRecorte(
  ajuste: AjusteRecorte,
  actual: { inicio: number | null; fin: number | null },
): { inicio: number | null; fin: number | null } {
  const inicio =
    ajuste.deltaInicio !== undefined ? Math.max(0, (actual.inicio ?? 0) + ajuste.deltaInicio) : actual.inicio;
  const fin = ajuste.deltaFin !== undefined ? (actual.fin ?? 0) + ajuste.deltaFin : actual.fin;
  return { inicio, fin };
}
