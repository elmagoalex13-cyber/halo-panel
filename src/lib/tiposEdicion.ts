// Los tipos de vídeo que se pueden pedir. 1 y 2 los edita el editor IA (runner); el 3 (TikTok) NO se edita: se sube tal cual.
// (Antes habia "Parar imagen" y "Referencia": ya no se ofrecen. No quedaba nada de ellos pendiente en la base de datos.)
export const TIPOS_EDICION = [
  { tipo: 1, nombre: "Subtítulos", desc: "La modelo habla a cámara; se subtitula" },
  { tipo: 2, nombre: "Gesto + frase", desc: "Un gesto con una frase y una canción" },
  { tipo: 3, nombre: "TikTok", desc: "Sin edición: llega tal cual la sube la modelo" },
] as const;

/** Tipos sin edicion: el editor solo los pasa a mp4 y quedan listos en la Mesa de aprobacion. */
export const TIPOS_SIN_EDICION: number[] = [3];

export const nombreTipo = (tipo: number) => (tipo === 4 ? "Referencia (antiguo)" : TIPOS_EDICION.find((t) => t.tipo === tipo)?.nombre ?? `Tipo ${tipo}`);
