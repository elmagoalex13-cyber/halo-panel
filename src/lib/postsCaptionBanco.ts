// Captions de los posts de OnlyFans: salen del banco propio (tabla captions, pagina Captions), sin IA.
// Para cada modelo se elige uno que ella no haya usado ya; si lo han usado otras modelos se cambia el final (emojis) para que no sea calcado.
import { createAdminClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createAdminClient>;

const EMOJIS = ["😏", "😈", "🥵", "🔥", "😉", "🤭", "💋", "😘", "🥰", "😌", "💦", "😇", "🫦", "❤️"];
const FINAL_EMOJIS = /[\p{Extended_Pictographic}‍️\s]+$/u;

const clave = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const azar = <T,>(l: T[]): T => l[Math.floor(Math.random() * l.length)];

/** Cambia los emojis del final (o pone uno si no tiene): el mismo texto con otro cierre. */
export function variante(texto: string): string {
  const base = texto.replace(FINAL_EMOJIS, "").trimEnd();
  const n = Math.random() < 0.5 ? 1 : 2;
  const emojis = Array.from({ length: n }, () => azar(EMOJIS)).filter((e, i, l) => l.indexOf(e) === i).join("");
  return `${base} ${emojis}`.trim();
}

export type ContextoBanco = { bancos: string[]; usadosModelo: Set<string>; usosGlobales: Map<string, number> };

/** Carga el banco de captions activos de tipo foto y lo que ya se ha usado (por esta modelo y por todas). null si el banco no existe todavia. */
export async function cargarBanco(db: Db, modeloId: string): Promise<ContextoBanco | null> {
  const [{ data: banco, error }, { data: usados }] = await Promise.all([
    db.from("captions").select("texto").eq("tipo", "foto").eq("activa", true).limit(5000),
    db.from("posts_programados").select("modelo_id, caption").not("caption", "is", null).neq("estado", "descartado").limit(20000),
  ]);
  if (error || !banco?.length) return null;
  const usadosModelo = new Set<string>();
  const usosGlobales = new Map<string, number>();
  for (const u of usados ?? []) {
    const k = clave(u.caption as string);
    usosGlobales.set(k, (usosGlobales.get(k) ?? 0) + 1);
    if (u.modelo_id === modeloId) usadosModelo.add(k);
  }
  return { bancos: banco.map((b) => b.texto as string), usadosModelo, usosGlobales };
}

/** Elige el siguiente caption y lo apunta como usado en el contexto (para que el siguiente post de la misma tanda no lo repita). */
export function elegirCaption(ctx: ContextoBanco, excluir: string[] = []): string | null {
  const fuera = new Set(excluir.map(clave));
  const libres = ctx.bancos.filter((t) => !ctx.usadosModelo.has(clave(t)) && !fuera.has(clave(t)));
  if (!libres.length) return null;
  const usos = (t: string) => ctx.usosGlobales.get(clave(t)) ?? 0;
  const minimo = Math.min(...libres.map(usos));
  const elegido = azar(libres.filter((t) => usos(t) === minimo));
  const final = minimo > 0 ? variante(elegido) : elegido;
  const k = clave(final);
  ctx.usadosModelo.add(k);
  ctx.usadosModelo.add(clave(elegido));
  ctx.usosGlobales.set(clave(elegido), usos(elegido) + 1);
  ctx.usosGlobales.set(k, (ctx.usosGlobales.get(k) ?? 0) + 1);
  return final;
}
