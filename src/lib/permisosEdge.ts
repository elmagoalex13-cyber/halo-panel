// Permisos de un usuario no-dueño, leídos de Supabase desde el middleware (runtime edge: solo fetch).
// Cache de 60 s por usuario: si lo desactivas o cambias sus secciones, surte efecto en menos de un minuto.

export type PermisosUsuario = { activo: boolean; denegadas: string[] };

const cache = new Map<string, { t: number; p: PermisosUsuario | null }>();
const TTL_MS = 60_000;

/** null = el usuario no existe; "error" = no se pudo comprobar (el middleware lo trata como denegado). */
export async function permisosDe(username: string): Promise<PermisosUsuario | null | "error"> {
  const previo = cache.get(username);
  if (previo && Date.now() - previo.t < TTL_MS) return previo.p;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return "error";
  try {
    const res = await fetch(`${url}/rest/v1/panel_usuarios?username=eq.${encodeURIComponent(username)}&select=activo,areas_denegadas&limit=1`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}` },
      cache: "no-store",
    });
    if (!res.ok) return "error";
    const filas = (await res.json()) as Array<{ activo: boolean; areas_denegadas: string[] | null }>;
    const p = filas[0] ? { activo: Boolean(filas[0].activo), denegadas: filas[0].areas_denegadas ?? [] } : null;
    cache.set(username, { t: Date.now(), p });
    return p;
  } catch {
    return "error";
  }
}
