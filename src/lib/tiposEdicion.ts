// Los 4 tipos de edición que hace el editor IA (runner)
export const TIPOS_EDICION = [
  { tipo: 1, nombre: "Subtítulos", desc: "La modelo habla a cámara; se subtitula" },
  { tipo: 2, nombre: "Gesto + frase", desc: "Un gesto con una frase y una canción" },
  { tipo: 3, nombre: "Parar imagen", desc: "Se congela 1 s la imagen cuando suena el trigger" },
  { tipo: 4, nombre: "Referencia", desc: "Se edita exactamente igual que el vídeo de referencia" },
] as const;

export const nombreTipo = (tipo: number) => TIPOS_EDICION.find((t) => t.tipo === tipo)?.nombre ?? `Tipo ${tipo}`;
