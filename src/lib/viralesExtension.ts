// Logica de "que es viral" para la extension de Chrome. La extension solo lee Instagram y sube
// ficheros; aqui se decide que reels merecen la pena (misma regla que el scraper del runner:
// ultimos N dias, vistas por encima de mediana x factor y, en cuentas de frases, estilo frase+musica).

export type ReelExtension = {
  codigo: string;
  vistas: number;
  likes: number;
  comentarios: number;
  compartidos: number;
  descripcion: string | null;
  audio: { id?: string | null; titulo?: string | null; artista?: string | null } | null;
  fecha: string | null;
  esVideo: boolean;
};

export type ReelViral = ReelExtension & { viralScore: number; estiloScore: number };

export const AJUSTES_POR_DEFECTO = { dias: 14, factor: 1.5, max: 8 };

const num = (v: unknown) => Math.max(0, Number(v ?? 0) || 0);
const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);

export function mediana(valores: number[]) {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : Math.round((orden[mitad - 1] + orden[mitad]) / 2);
}

export function fraseDesdeDescripcion(descripcion: string | null | undefined) {
  const texto = String(descripcion ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  const entreComillas = texto.match(/[“"']([^“"']{8,140})[”"']/)?.[1];
  if (entreComillas) return entreComillas.trim();
  const primera = texto.split(/[.!?]\s/)[0]?.trim();
  return primera && primera.length >= 8 && primera.length <= 140 ? primera : null;
}

export function scoreViralidad(reel: ReelExtension, medianaCuenta: number) {
  const relativas = medianaCuenta > 0 ? reel.vistas / medianaCuenta : 1;
  return (
    Math.log10(reel.vistas + 1) * 0.8 +
    Math.min(relativas, 8) * 0.7 +
    ratio(reel.comentarios, reel.vistas) * 260 +
    ratio(reel.compartidos, reel.vistas) * 80 +
    ratio(reel.likes, reel.vistas) * 12
  );
}

export function scoreEstiloFraseMusica(reel: ReelExtension) {
  const descripcion = String(reel.descripcion ?? "");
  const limpio = descripcion.replace(/#[\p{L}\p{N}_]+/gu, "").trim();
  let score = 0;
  if (reel.audio?.titulo || reel.audio?.id) score += 0.45;
  if (fraseDesdeDescripcion(descripcion)) score += 0.25;
  if (limpio.length > 0 && limpio.length <= 180) score += 0.1;
  if (/[“"'].*[”"']/.test(descripcion)) score += 0.1;
  if (/frase|pov|cuando|nadie|siempre|nunca|recuerda|mujer|hombre/i.test(descripcion)) score += 0.1;
  if (descripcion.length > 600) score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

/** Normaliza lo que manda la extension (nunca se fia del formato). */
export function sanearReels(entrada: unknown): ReelExtension[] {
  if (!Array.isArray(entrada)) return [];
  const salida: ReelExtension[] = [];
  for (const r of entrada.slice(0, 200)) {
    const codigo = typeof r?.codigo === "string" && /^[A-Za-z0-9_-]{5,20}$/.test(r.codigo) ? r.codigo : null;
    if (!codigo) continue;
    const fecha = typeof r.fecha === "string" && !Number.isNaN(Date.parse(r.fecha)) ? new Date(r.fecha).toISOString() : null;
    salida.push({
      codigo,
      vistas: num(r.vistas),
      likes: num(r.likes),
      comentarios: num(r.comentarios),
      compartidos: num(r.compartidos),
      descripcion: typeof r.descripcion === "string" ? r.descripcion.slice(0, 2000) : null,
      audio: r.audio && typeof r.audio === "object"
        ? { id: r.audio.id ? String(r.audio.id) : null, titulo: r.audio.titulo ? String(r.audio.titulo) : null, artista: r.audio.artista ? String(r.audio.artista) : null }
        : null,
      fecha,
      esVideo: Boolean(r.esVideo),
    });
  }
  return salida;
}

/**
 * Virales de una cuenta. `conocidos` son los codigos que ya estan guardados (en cualquier estado:
 * aprobados y descartados tampoco vuelven a salir).
 */
export function analizarCuenta(
  reels: ReelExtension[],
  { dias, factor, max, categoria, conocidos }: { dias: number; factor: number; max: number; categoria?: string | null; conocidos: Set<string> },
) {
  const validos = reels.filter((r) => r.esVideo && r.vistas > 0);
  const med = mediana(validos.map((r) => r.vistas));
  const umbral = Math.round(med * factor);
  const desde = Date.now() - dias * 86400000;
  const virales: ReelViral[] = validos
    .filter((r) => r.vistas > umbral && !conocidos.has(r.codigo) && (!r.fecha || new Date(r.fecha).getTime() >= desde))
    .map((r) => ({ ...r, viralScore: scoreViralidad(r, med), estiloScore: scoreEstiloFraseMusica(r) }))
    .filter((r) => categoria !== "frases" || r.estiloScore >= 0.45)
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, max);
  return { mediana: med, umbral, analizados: validos.length, virales };
}

const limpiarTag = (v: string) => v.replace(/\s+/g, " ").replace(/[|\n\r]/g, " ").trim().slice(0, 120);

/** Mismas etiquetas que escribe el scraper del runner: asi "Ideas virales" las lee igual. */
export function tagsMetricas(reel: ReelViral, categoria: string) {
  const tags = [
    `meta:categoria=${categoria || "general"}`,
    `m:codigo=${reel.codigo}`,
    `m:comentarios=${reel.comentarios}`,
    `m:compartidos=${reel.compartidos}`,
    `meta:tasa_comentarios=${ratio(reel.comentarios, reel.vistas).toFixed(5)}`,
    `meta:tasa_compartidos=${ratio(reel.compartidos, reel.vistas).toFixed(5)}`,
    `meta:metricas=${new Date().toISOString().slice(0, 10)}`,
    `meta:viral_score=${reel.viralScore.toFixed(3)}`,
    `meta:estilo_score=${reel.estiloScore.toFixed(3)}`,
    "meta:origen=extension",
  ];
  if (reel.audio?.titulo) tags.push(`meta:cancion=${limpiarTag(reel.audio.titulo)}`);
  if (reel.audio?.artista) tags.push(`meta:artista=${limpiarTag(reel.audio.artista)}`);
  if (reel.audio?.id) tags.push(`meta:audio_id=${limpiarTag(reel.audio.id)}`);
  return tags;
}

export function ajustesDe(body: { dias?: unknown; factor?: unknown; max?: unknown }) {
  const acota = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    dias: acota(body.dias, AJUSTES_POR_DEFECTO.dias, 1, 365),
    factor: acota(body.factor, AJUSTES_POR_DEFECTO.factor, 1, 10),
    max: Math.round(acota(body.max, AJUSTES_POR_DEFECTO.max, 1, 30)),
  };
}

export const CATEGORIAS_REFERENCIA = ["frases", "hablado", "referencia", "general"];
