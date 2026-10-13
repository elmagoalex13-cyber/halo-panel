// Temas de los captions del banco: cada uno es una pestaña del documento de captions (se guardan como etiquetas en captions.tags).
export const TEMAS_CAPTION: Array<{ id: string; etiqueta: string }> = [
  { id: "feed", etiqueta: "Feed (general)" },
  { id: "cta", etiqueta: "CTA / invita a escribir" },
  { id: "culo", etiqueta: "Culo 🍑" },
  { id: "tetas", etiqueta: "Tetas 🍒" },
  { id: "pussy", etiqueta: "Pussy 🐚" },
  { id: "manana", etiqueta: "Mañana ☀️" },
  { id: "noche", etiqueta: "Noche 🌙" },
  { id: "contacto_visual", etiqueta: "Contacto visual 👀" },
  { id: "bano_wet", etiqueta: "Baño / Wet 🚿" },
  { id: "fitness", etiqueta: "Fitness 💪" },
  { id: "dick_cumshot", etiqueta: "Dick / Cumshot 🍆" },
  { id: "postura", etiqueta: "Postura 🔥" },
  { id: "cocina", etiqueta: "Cocina / Comida 🍳" },
  { id: "estudiosa", etiqueta: "Estudiosa 📚" },
  { id: "piscina_playa", etiqueta: "Piscina / Playa 👙" },
  { id: "angel_demonio", etiqueta: "Ángel / Demonio 😇😈" },
  { id: "gamer", etiqueta: "Gamer 🎮" },
  { id: "coche", etiqueta: "Coche 🚗" },
  { id: "balon", etiqueta: "Balón ⚽" },
  { id: "navidad", etiqueta: "Navidad 🎄" },
];

export const etiquetaTema = (id: string) => TEMAS_CAPTION.find((t) => t.id === id)?.etiqueta ?? id;
