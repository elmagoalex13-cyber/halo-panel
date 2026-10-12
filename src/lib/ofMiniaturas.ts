import { listarObjetosOF, urlVista } from "@/lib/r2/onlyfans";

// Miniaturas de las fotos de OnlyFans. La foto original se guarda tal cual (sin recomprimir) y puede pesar 2-5 MB; si el movil tiene que
// bajar 18 originales solo para pintar el cuadradito de un script, tarda una eternidad. Por eso, al subir una foto el navegador de la
// modelo genera una copia pequena (JPEG ~480 px, unas decenas de KB) que se guarda junto a ella: <clave>.thumb.jpg. Sin tabla: es
// una convencion de nombres. Si una foto (antigua) no la tiene, se usa la original.
export const claveMiniatura = (key: string) => `${key}.thumb.jpg`;

/** Claves de miniaturas que ya existen para una modelo (una sola consulta a R2 por carga de pagina). */
export async function miniaturasDeModelo(modeloId: string): Promise<Set<string>> {
  try {
    const objetos = await listarObjetosOF(`onlyfans/${modeloId}/`, 20000);
    return new Set(objetos.map((o) => o.key).filter((k) => k.endsWith(".thumb.jpg")));
  } catch {
    return new Set();
  }
}

/** URL temporal para VER una foto en miniatura: la miniatura si existe; si no, la original. */
export function urlVistaFoto(key: string, bucket: string | undefined, minis: Set<string>) {
  return urlVista(minis.has(claveMiniatura(key)) ? claveMiniatura(key) : key, bucket);
}
