import type { ReferenciaVideo } from "@/types";

// El scraper guarda comentarios/compartidos como tags "m:clave=valor" (la tabla no tiene esas columnas).
export function metricasDe(v: ReferenciaVideo) {
  const meta: Record<string, string> = {};
  for (const t of v.tags ?? []) {
    const m = t.match(/^(?:m|meta):([a-z_]+)=(.*)$/);
    if (m) meta[m[1]] = m[2];
  }
  const vistas = Number(v.visitas) || 0;
  const likes = Number(v.likes) || 0;
  const comentarios = Number(meta.comentarios) || 0;
  const compartidos = Number(meta.compartidos) || 0;
  const pct = (n: number) => (vistas > 0 ? (n / vistas) * 100 : 0);
  return {
    vistas,
    likes,
    comentarios,
    compartidos,
    tasaLikes: pct(likes),
    tasaComentarios: pct(comentarios),
    tasaCompartidos: pct(compartidos),
    codigo: meta.codigo ?? null,
    categoria: meta.categoria ?? v.cuenta_categoria ?? null,
    cancion: meta.cancion ?? null,
    artista: meta.artista ?? null,
    audioId: meta.audio_id ?? null,
  };
}

export function compacto(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} K`;
  return String(n);
}

export const pct = (n: number) => `${n.toFixed(n < 1 ? 2 : 1).replace(".", ",")} %`;
