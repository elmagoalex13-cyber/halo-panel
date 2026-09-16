export type FormatoOption = { key: string; num: number; label: string };
export type FormatoGroup = { key: string; label: string; options: FormatoOption[] };

export const FORMATO_GROUPS: FormatoGroup[] = [
  {
    key: "hablando",
    label: "hablando",
    options: [
      { key: "preguntas_respuestas", num: 1, label: "Preguntas y respuestas" },
      { key: "generico_of_propuesta", num: 2, label: "Generico tipo OF propuesta" },
      { key: "sketch_sin_hablar", num: 3, label: "Sketch sin hablar" },
    ],
  },
  {
    key: "caption",
    label: "caption",
    options: [
      { key: "frases", num: 4, label: "Frases" },
      { key: "memes", num: 5, label: "Memes" },
    ],
  },
  {
    key: "retos",
    label: "retos",
    options: [
      { key: "parar_imagen", num: 6, label: "Parar imagen" },
      { key: "reto_generico", num: 7, label: "Reto generico" },
    ],
  },
];

export const FORMATO_OPTIONS: FormatoOption[] = FORMATO_GROUPS.flatMap((group) => group.options);

export function formatoLabel(key?: string | null): string | null {
  if (!key) return null;
  return FORMATO_OPTIONS.find((option) => option.key === key)?.label ?? key;
}
