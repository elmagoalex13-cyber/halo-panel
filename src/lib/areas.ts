// Secciones del panel que se pueden ocultar a un usuario concreto. Sin dependencias (vale para el middleware y el cliente).

export type AreaId = "leads" | "facturacion" | "vault" | "onlyfans" | "landings" | "logs";

export const AREAS: Array<{ id: AreaId; label: string; descripcion: string; paginas: string[]; apis: string[] }> = [
  { id: "leads", label: "Leads de la web", descripcion: "Contactos que llegan desde las landings", paginas: ["/leads"], apis: ["/api/leads"] },
  { id: "facturacion", label: "Facturación", descripcion: "Ingresos de Venuz y cobros", paginas: ["/facturacion"], apis: ["/api/facturacion", "/api/venuz"] },
  { id: "vault", label: "Vault (baúl compartido)", descripcion: "El baúl compartido. Tu baúl privado nunca lo ve ningún otro usuario", paginas: ["/vault"], apis: ["/api/vault"] },
  { id: "onlyfans", label: "OnlyFans", descripcion: "Scripts, packs y posts de las modelos", paginas: ["/onlyfans"], apis: ["/api/onlyfans"] },
  { id: "landings", label: "Landings", descripcion: "Páginas de captación y sus estadísticas", paginas: ["/landings"], apis: [] },
  { id: "logs", label: "Actividad", descripcion: "Registro de lo que hace el sistema", paginas: ["/logs"], apis: [] },
];

/** Rutas que solo puede usar el dueño (gestion de usuarios). */
export const SOLO_DUENO = ["/api/panel/usuarios"];

const coincide = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Seccion a la que pertenece una ruta (null = libre para cualquier usuario del panel). */
export function areaDePath(pathname: string): AreaId | null {
  for (const a of AREAS) if ([...a.paginas, ...a.apis].some((p) => coincide(pathname, p))) return a.id;
  return null;
}

export const esSoloDueno = (pathname: string) => SOLO_DUENO.some((p) => coincide(pathname, p));
export const areasValidas = (xs: unknown): AreaId[] =>
  Array.isArray(xs) ? (xs.filter((x): x is AreaId => AREAS.some((a) => a.id === x)) as AreaId[]) : [];
