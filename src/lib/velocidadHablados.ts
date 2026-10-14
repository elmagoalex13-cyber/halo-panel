// Velocidad y volumen de los videos hablados (tipo 1, con subtitulos): como en Edits de Instagram, 1.1x, 1.2x... y mas volumen.
// Lo elegido para una pieza se guarda en notas_editor con las marcas [velocidad=1.2] y [volumen=1.5] (sin tocar la base de datos);
// el editor (runner) las lee al rehacer el video. Sin marca = normal.
export const OPCIONES_VELOCIDAD = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5] as const;
export const OPCIONES_VOLUMEN = [1, 1.25, 1.5, 2, 2.5, 3] as const;

const MARCA_VELOCIDAD = /\[velocidad=([0-9.]+)\]/;
const MARCA_VOLUMEN = /\[volumen=([0-9.]+)\]/;

export const textoVelocidad = (v: number) => `${String(v).replace(".", ",")}x`;
export const textoVolumen = (v: number) => (v === 1 ? "Normal" : `+${Math.round((v - 1) * 100)}%`);

/** Velocidad guardada en las notas de la pieza (1 si no hay ninguna o no es valida). */
export function leerVelocidad(notas: string | null | undefined): number {
  const v = Number(MARCA_VELOCIDAD.exec(notas ?? "")?.[1]);
  return Number.isFinite(v) && v >= 1 && v <= 1.5 ? v : 1;
}

/** Volumen guardado en las notas de la pieza (1 = normal). */
export function leerVolumen(notas: string | null | undefined): number {
  const v = Number(MARCA_VOLUMEN.exec(notas ?? "")?.[1]);
  return Number.isFinite(v) && v >= 1 && v <= 3 ? v : 1;
}

/** Notas con la velocidad y el volumen puestos (se quitan si son 1), conservando el resto de marcas. */
export function ponerAjustes(notas: string | null | undefined, ajustes: { velocidad: number; volumen: number }): string | null {
  const resto = (notas ?? "").replace(/\[velocidad=[0-9.]+\]/g, "").replace(/\[volumen=[0-9.]+\]/g, "").trim();
  const marcas = [ajustes.velocidad > 1 ? `[velocidad=${ajustes.velocidad}]` : "", ajustes.volumen > 1 ? `[volumen=${ajustes.volumen}]` : ""].filter(Boolean);
  const nueva = [resto, ...marcas].filter(Boolean).join("\n");
  return nueva || null;
}
