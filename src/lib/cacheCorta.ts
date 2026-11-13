// Cache corta en memoria para lo que casi no cambia y se pide en cada pantalla (lista de fotos de modelos, vistas previas listas...).
// Vale por instancia del servidor: si dos pantallas lo piden a la vez, comparten la misma peticion; si falla, no se guarda el fallo.
const guardado = new Map<string, { at: number; valor: unknown }>();
const enCurso = new Map<string, Promise<unknown>>();

export async function conCache<T>(clave: string, ms: number, pedir: () => Promise<T>): Promise<T> {
  const hit = guardado.get(clave);
  if (hit && Date.now() - hit.at < ms) return hit.valor as T;
  const previa = enCurso.get(clave);
  if (previa) return previa as Promise<T>;
  const p = pedir()
    .then((v) => {
      guardado.set(clave, { at: Date.now(), valor: v });
      return v;
    })
    .finally(() => enCurso.delete(clave));
  enCurso.set(clave, p);
  return p;
}

/** Olvida lo guardado (p. ej. justo despues de cambiar la foto de una modelo). */
export const olvidarCache = (clave: string) => void guardado.delete(clave);
