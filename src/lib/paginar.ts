// Supabase devuelve como mucho 1.000 filas por consulta (aunque se ponga .limit(5000)): para leer todo hay que pedirlo por paginas.
type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function leerTodo<T>(consulta: (desde: number, hasta: number) => Pagina<T>, maxFilas = 50000): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = [];
  for (let desde = 0; desde < maxFilas; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) return { data: filas, error };
    filas.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return { data: filas, error: null };
}
