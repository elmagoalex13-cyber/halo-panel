// Temas de los captions del banco (se guardan como etiquetas en captions.tags). Los captions del documento se clasificaron por su contenido.
export const TEMAS_CAPTION: Array<{ id: string; etiqueta: string }> = [
  { id: "playa", etiqueta: "Playa / piscina" },
  { id: "gym", etiqueta: "Gym / fit" },
  { id: "cama", etiqueta: "Cama / mañana" },
  { id: "noche", etiqueta: "Noche / salir" },
  { id: "culo", etiqueta: "Culo" },
  { id: "pecho", etiqueta: "Pecho / escote" },
  { id: "lenceria", etiqueta: "Lencería" },
  { id: "ducha", etiqueta: "Ducha / baño" },
  { id: "casa", etiqueta: "En casa" },
  { id: "disfraz", etiqueta: "Uniforme / disfraz" },
  { id: "espejo", etiqueta: "Espejo / selfie" },
  { id: "calle", etiqueta: "Calle / viaje" },
  { id: "chat", etiqueta: "Invita a escribir" },
  { id: "juego", etiqueta: "Juego / pregunta" },
  { id: "traviesa", etiqueta: "Traviesa / mala" },
  { id: "general", etiqueta: "General (sin tema)" },
];

export const etiquetaTema = (id: string) => TEMAS_CAPTION.find((t) => t.id === id)?.etiqueta ?? id;
