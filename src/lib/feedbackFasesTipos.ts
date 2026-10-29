// Tipos y calculo del feedback por fase (sin nada de servidor: lo usan tambien los componentes del navegador).
export type FeedbackFase = { tipo: "bien" | "mejorar"; texto: string; at: string; por: string };
export type FeedbackFases = Record<string, FeedbackFase>; // clave = numero de fase ("1".."8")
export type EstadoFase = "mejorar" | "repetido" | "bien" | null;

/** Como esta una fase respecto al feedback: «mejorar» (pendiente de que ella lo cambie), «repetido» (ya ha subido algo DESPUES del feedback), «bien» o sin feedback. */
export function estadoFase(fb: FeedbackFase | undefined, archivosDeLaFase: Array<{ created_at: string }>): EstadoFase {
  if (!fb) return null;
  if (fb.tipo === "bien") return "bien";
  const desde = new Date(fb.at).getTime();
  return archivosDeLaFase.some((a) => new Date(a.created_at).getTime() > desde) ? "repetido" : "mejorar";
}

/** Fases de un script con «a mejorar» aun sin cambiar (con su comentario), en orden. */
export function fasesPendientes(fb: FeedbackFases | undefined, archivos: Array<{ fase: number | null; created_at: string }>): Array<{ fase: number; texto: string }> {
  if (!fb) return [];
  return Object.entries(fb)
    .filter(([fase, f]) => estadoFase(f, archivos.filter((a) => a.fase === Number(fase))) === "mejorar")
    .map(([fase, f]) => ({ fase: Number(fase), texto: f.texto }))
    .sort((a, b) => a.fase - b.fase);
}
