import { listarObjetosOF, urlDescarga, urlVista } from "@/lib/r2/onlyfans";

// Fotos de historias de Instagram que sube la modelo desde su portal. Viven en R2 bajo historias/<modelo>/<archivo>
// (sin tabla): la carpeta ES el registro. Se ven y se descargan con enlaces temporales.
export const prefijoHistorias = (modeloId: string) => `historias/${modeloId}/`;
export const MAX_HISTORIAS = 300; // por modelo: evita que una carpeta crezca sin control
export const TAM_MAX_HISTORIA = 40 * 1024 * 1024;

export type Historia = { key: string; nombre: string; size: number; fecha: string | null; vista: string; descarga: string };

export async function listarHistorias(modeloId: string): Promise<Historia[]> {
  const objetos = await listarObjetosOF(prefijoHistorias(modeloId), MAX_HISTORIAS + 50);
  objetos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return Promise.all(
    objetos.slice(0, MAX_HISTORIAS).map(async (o) => {
      const nombre = o.key.split("/").pop() ?? "historia.jpg";
      return { key: o.key, nombre, size: o.size, fecha: o.fecha, vista: await urlVista(o.key), descarga: await urlDescarga(o.key, nombre) };
    }),
  );
}
