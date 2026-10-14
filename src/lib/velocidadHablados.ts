// Velocidad de los videos hablados (tipo 1, con subtitulos): como en Edits de Instagram, 1.1x, 1.2x...
// La velocidad elegida para una pieza se guarda en notas_editor con la marca [velocidad=1.2] (sin tocar la base de datos);
// el editor (runner) la lee al rehacer el video. Sin marca = velocidad normal.
export const OPCIONES_VELOCIDAD = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5] as const;

const MARCA = /\[velocidad=([0-9.]+)\]/;

export const textoVelocidad = (v: number) => `${String(v).replace(".", ",")}x`;

/** Velocidad guardada en las notas de la pieza (1 si no hay ninguna o no es valida). */
export function leerVelocidad(notas: string | null | undefined): number {
  const v = Number(MARCA.exec(notas ?? "")?.[1]);
  return Number.isFinite(v) && v >= 1 && v <= 1.5 ? v : 1;
}

/** Notas con la velocidad puesta (o quitada si es 1), conservando el resto de marcas. */
export function ponerVelocidad(notas: string | null | undefined, v: number): string | null {
  const resto = (notas ?? "").replace(/\[velocidad=[0-9.]+\]/g, "").trim();
  const nueva = v > 1 ? [resto, `[velocidad=${v}]`].filter(Boolean).join("\n") : resto;
  return nueva || null;
}
