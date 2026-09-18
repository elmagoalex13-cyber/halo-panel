// Utilidades de URLs de video (R2). Seguras para cliente y servidor.

const BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

/** Convierte una key de R2 o una URL (incluso con "https://https://") en una URL publica valida. */
export function urlR2(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.replace(/^https?:\/\/(https?:\/\/)/i, "$1");
  if (/^https?:\/\//i.test(limpio)) return limpio;
  return BASE ? `${BASE}/${limpio.replace(/^\/+/, "")}` : null;
}

/** Key de R2 a partir de una key o URL publica. */
export function keyR2(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.replace(/^https?:\/\/(https?:\/\/)/i, "$1");
  if (!/^https?:\/\//i.test(limpio)) return limpio.replace(/^\/+/, "");
  try {
    return decodeURIComponent(new URL(limpio).pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

export type PiezaVideo = {
  r2_key?: string | null;
  r2_key_original?: string | null;
  video_procesado_url?: string | null;
};

/** Video editado (procesado por el runner). Si aun no hay, cae al r2_key legado. */
export function videoEditado(p: PiezaVideo): string | null {
  return urlR2(p.video_procesado_url) ?? (p.video_procesado_url ? null : urlR2(p.r2_key));
}

/** Video bruto original grabado por la modelo. */
export function videoBruto(p: PiezaVideo): string | null {
  return urlR2(p.r2_key_original) ?? (p.video_procesado_url ? urlR2(p.r2_key) : null);
}

export function keyEditado(p: PiezaVideo): string | null {
  return keyR2(p.video_procesado_url) ?? (p.video_procesado_url ? null : keyR2(p.r2_key));
}

export function keyBruto(p: PiezaVideo): string | null {
  return keyR2(p.r2_key_original) ?? (p.video_procesado_url ? keyR2(p.r2_key) : null);
}
