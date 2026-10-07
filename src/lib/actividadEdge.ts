// Registro de actividad de los usuarios que NO son el dueño (tu socio). Sin dependencias de Node: lo usa el middleware (edge).
// Se guarda en la tabla panel_actividad (SQL 20261015).

export type Actividad = { accion: string; sensible: boolean; ids: string[] };

type Regla = { metodo: string; ruta: RegExp; accion: string; sensible?: boolean };

// Orden importa: gana la primera que coincide. Lo que no está aquí (lecturas, firmas de subida...) no se registra.
const REGLAS: Regla[] = [
  // Vault
  { metodo: "DELETE", ruta: /^\/api\/vault$/, accion: "Mandó una contraseña del Vault a la papelera", sensible: true },
  { metodo: "PUT", ruta: /^\/api\/vault$/, accion: "Editó una contraseña del Vault", sensible: true },
  { metodo: "POST", ruta: /^\/api\/vault$/, accion: "Añadió una contraseña al Vault" },
  // Modelos y su portal
  { metodo: "POST", ruta: /^\/api\/modelos\/[^/]+\/portal$/, accion: "Generó el acceso al portal de una modelo", sensible: true },
  { metodo: "POST", ruta: /^\/api\/modelos\/[^/]+\/cuentas$/, accion: "Añadió una cuenta de Instagram a una modelo" },
  { metodo: "DELETE", ruta: /^\/api\/modelos\/[^/]+\/foto$/, accion: "Quitó la foto de una modelo" },
  { metodo: "PUT", ruta: /^\/api\/modelos\/[^/]+\/foto$/, accion: "Cambió la foto de una modelo" },
  { metodo: "DELETE", ruta: /^\/api\/modelos\/[^/]+$/, accion: "Mandó una modelo a la papelera", sensible: true },
  { metodo: "PATCH", ruta: /^\/api\/modelos\/[^/]+$/, accion: "Editó una modelo" },
  { metodo: "POST", ruta: /^\/api\/modelos$/, accion: "Creó una modelo" },
  // Cuentas de Instagram
  { metodo: "DELETE", ruta: /^\/api\/cuentas\/[^/]+$/, accion: "Borró una cuenta de Instagram", sensible: true },
  { metodo: "POST", ruta: /^\/api\/cuentas\/[^/]+\/conectar$/, accion: "Conectó Metricool a una cuenta" },
  { metodo: "PATCH", ruta: /^\/api\/cuentas\/[^/]+$/, accion: "Editó una cuenta de Instagram" },
  // Vídeos
  { metodo: "DELETE", ruta: /^\/api\/originales$/, accion: "Borró vídeos originales", sensible: true },
  { metodo: "POST", ruta: /^\/api\/upload$/, accion: "Subió un vídeo" },
  { metodo: "PATCH", ruta: /^\/api\/aprobacion\/accion$/, accion: "Aprobó, rechazó o rehízo un vídeo" },
  { metodo: "POST", ruta: /^\/api\/aprobacion\/cambiar-video$/, accion: "Cambió el vídeo de una pieza" },
  { metodo: "POST", ruta: /^\/api\/aprobacion\/publicado$/, accion: "Marcó vídeos como publicados" },
  { metodo: "POST", ruta: /^\/api\/aprobacion$/, accion: "Actuó en la mesa de aprobación" },
  { metodo: "DELETE", ruta: /^\/api\/asignar$/, accion: "Quitó una asignación de vídeo", sensible: true },
  { metodo: "POST", ruta: /^\/api\/asignar$/, accion: "Asignó vídeos a modelos" },
  { metodo: "POST", ruta: /^\/api\/referencias\/videos\/[^/]+\/asignar$/, accion: "Asignó un vídeo de referencia" },
  { metodo: "POST", ruta: /^\/api\/referencias\/banco\/enviar$/, accion: "Envió vídeos del banco a modelos" },
  { metodo: "PATCH", ruta: /^\/api\/virales-propios\/[^/]+$/, accion: "Cambió el estado de un viral propio" },
  { metodo: "PATCH", ruta: /^\/api\/trial-reels$/, accion: "Cambió un trial reel" },
  // OnlyFans
  { metodo: "DELETE", ruta: /^\/api\/onlyfans\/coleccion$/, accion: "Borró un script, pack o post de OnlyFans", sensible: true },
  { metodo: "PATCH", ruta: /^\/api\/onlyfans\/coleccion$/, accion: "Editó un script, pack o post de OnlyFans" },
  { metodo: "POST", ruta: /^\/api\/onlyfans\/marcar$/, accion: "Marcó contenido de OnlyFans" },
  // Facturación y Venuz
  { metodo: "DELETE", ruta: /^\/api\/facturacion\/[^/]+$/, accion: "Borró un cobro", sensible: true },
  { metodo: "PATCH", ruta: /^\/api\/facturacion\/[^/]+$/, accion: "Editó un cobro" },
  { metodo: "POST", ruta: /^\/api\/facturacion$/, accion: "Registró un cobro" },
  { metodo: "POST", ruta: /^\/api\/venuz\/vincular$/, accion: "Vinculó una cuenta de Venuz con una modelo" },
  { metodo: "POST", ruta: /^\/api\/venuz\/sync$/, accion: "Lanzó la sincronización de Venuz" },
  // Referencias y frases
  { metodo: "DELETE", ruta: /^\/api\/referencias\/[^/]+$/, accion: "Borró una cuenta de referencia", sensible: true },
  { metodo: "POST", ruta: /^\/api\/referencias$/, accion: "Añadió una cuenta de referencia" },
  { metodo: "DELETE", ruta: /^\/api\/frases$/, accion: "Borró una frase", sensible: true },
  { metodo: "POST", ruta: /^\/api\/frases$/, accion: "Añadió una frase" },
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Hay que anotar esta petición? Devuelve null si no (lecturas, firmas de subida, etc.). */
export function clasificarActividad(metodo: string, pathname: string, params: URLSearchParams): Actividad | null {
  const m = metodo.toUpperCase();
  const idParam = params.get("id");
  const ids = [...(pathname.match(UUID) ?? []), ...(idParam && ES_UUID.test(idParam) ? [idParam] : [])];

  // Ver una contraseña del Vault (la única lectura que se anota)
  if (m === "GET" && pathname === "/api/vault" && params.get("id")) return { accion: "Vio una contraseña del Vault", sensible: false, ids: [params.get("id")!] };

  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return null;
  const r = REGLAS.find((x) => x.metodo === m && x.ruta.test(pathname));
  return r ? { accion: r.accion, sensible: Boolean(r.sensible), ids: Array.from(new Set(ids)) } : null;
}

/** Guarda la entrada en panel_actividad (no bloquea al usuario: el middleware lo lanza con waitUntil). */
export async function registrarActividad(usuario: string, a: Actividad, metodo: string, ruta: string): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return;
  try {
    const res = await fetch(`${url}/rest/v1/panel_actividad`, {
      method: "POST",
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ usuario, accion: a.accion, sensible: a.sensible, ids: a.ids, metodo, ruta }),
    });
    if (!res.ok) console.error("[actividad] no se pudo guardar:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[actividad] error:", e instanceof Error ? e.message : e); // nunca debe romper la accion del usuario
  }
}
