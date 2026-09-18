// La BD solo admite tipo_video = tipo1..tipo3 (o null / sin_clasificar).
// El tipo 4 (con referencia) se guarda con tipo = 4 y tipo_video nulo.

/** Filtro PostgREST (.or) de piezas ya etiquetadas con un tipo valido. */
export const FILTRO_ETIQUETADO = "tipo_video.in.(tipo1,tipo2,tipo3),tipo.eq.4";

/** tipo_video "logico" (tipo1..tipo4 o sin_clasificar) a partir de las dos columnas. */
export function tipoVideoEfectivo(tipoVideo: string | null | undefined, tipo: number | null | undefined): string | null {
  if (tipoVideo && /^tipo[1-3]$/.test(tipoVideo)) return tipoVideo;
  if (tipo === 4) return "tipo4";
  return tipoVideo ?? null;
}

/** Columnas de BD que representan un tipo logico. */
export function columnasTipo(tipoVideo: string): { tipo: number | null; tipo_video: string | null } {
  const m = tipoVideo.match(/^tipo([1-4])$/);
  if (!m) return { tipo: null, tipo_video: tipoVideo };
  const n = Number(m[1]);
  return { tipo: n, tipo_video: n === 4 ? null : tipoVideo };
}

/** Numero 1-4 que usa el runner. */
export function tipoNumero(tipoVideo: string | null | undefined, tipo: number | null | undefined): number {
  const m = tipoVideo?.match(/[1-4]/);
  if (m) return Number(m[0]);
  return tipo && tipo >= 1 && tipo <= 4 ? tipo : 4;
}
