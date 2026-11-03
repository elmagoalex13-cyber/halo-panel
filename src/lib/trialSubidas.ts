// «Subir mi propio original» en Trial reels. El vídeo se sube en trozos de 4 MB a través del propio panel (R2 no responde desde algunas redes, y una
// funcion del servidor no admite mas de ~4,5 MB por peticion): subidas-trial/<codigo>/<00001>, <00002>… Al terminar se apunta una subida pendiente en
// panel_config (clave trial_subidas, sin tabla nueva, con «comparar y cambiar»). El editor (runner/src/subidas_trial.mjs) une los trozos, guarda el
// original como un viral propio (propios/<usuario>/<codigo>.<ext>, estado aprobado) y, si se pidio, lanza los trial reels.
import { createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, soloVisibles, veModelo } from "@/lib/alcance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La cuenta de Instagram (con su usuario y modelo) si quien mira puede usarla. */
export async function cuentaVisible(cuentaId: string) {
  if (!UUID.test(cuentaId)) return null;
  const alcance = await alcanceActual();
  const { data } = await soloVisibles(createAdminClient().from("cuentas_instagram").select("id, username, modelo_id").eq("id", cuentaId), alcance).maybeSingle();
  if (!data || !veModelo(alcance, (data.modelo_id as string | null) ?? null)) return null;
  return { id: data.id as string, modelo_id: (data.modelo_id as string | null) ?? null, usuario: String(data.username ?? "cuenta").replace(/^@/, "").replace(/[^a-z0-9._-]/gi, "_") };
}

export const CLAVE_TRIAL_SUBIDAS = "trial_subidas";
export const TROZO_BYTES = 4 * 1024 * 1024;
export const MAX_BYTES_ORIGINAL = 1.5 * 1024 ** 3;
export const CODIGO_SUBIDA = /^sub-[a-z0-9]{8,12}$/;
export const claveTrozo = (codigo: string, n: number) => `subidas-trial/${codigo}/${String(n).padStart(5, "0")}`;

export type SubidaTrial = {
  codigo: string;
  cuenta_id: string;
  modelo_id: string | null;
  usuario: string;
  partes: number;
  size: number;
  ext: string;
  nombre: string;
  descripcion: string;
  cantidad: number; // versiones a generar (1 a 3)
  generar: boolean; // lanzar los trial reels en cuanto este listo el original
  por: string;
  at: string;
  estado: "pendiente" | "procesando" | "error";
  empezado_at?: string;
  error?: string | null;
};

async function leer(): Promise<{ subidas: SubidaTrial[]; updated_at: string | null }> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", CLAVE_TRIAL_SUBIDAS).maybeSingle();
  const v = data?.value as { subidas?: SubidaTrial[] } | null | undefined;
  return { subidas: Array.isArray(v?.subidas) ? v.subidas : [], updated_at: (data?.updated_at as string | undefined) ?? null };
}

export const leerSubidas = async () => (await leer()).subidas;

async function cambiar(fn: (l: SubidaTrial[]) => SubidaTrial[] | null): Promise<boolean> {
  const db = createAdminClient();
  for (let i = 0; i < 6; i++) {
    const { subidas, updated_at } = await leer();
    const nuevas = fn(subidas);
    if (nuevas === null) return true;
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await db.from("panel_config").insert({ key: CLAVE_TRIAL_SUBIDAS, value: { subidas: nuevas }, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data, error } = await db.from("panel_config").update({ value: { subidas: nuevas }, updated_at: ahora }).eq("key", CLAVE_TRIAL_SUBIDAS).eq("updated_at", updated_at).select("key");
      if (!error && data?.length) return true;
    }
  }
  return false;
}

export const anadirSubida = (s: SubidaTrial) => cambiar((l) => [...l.filter((x) => x.codigo !== s.codigo), s]);
export const quitarSubida = (codigo: string) => cambiar((l) => (l.some((x) => x.codigo === codigo) ? l.filter((x) => x.codigo !== codigo) : null));

/** Extension segura del archivo original (mp4 por defecto). */
export function extensionVideo(nombre: string, tipo: string): string {
  const e = /\.([a-z0-9]{2,5})$/i.exec(nombre)?.[1]?.toLowerCase();
  if (e && ["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"].includes(e)) return e;
  return tipo.includes("quicktime") ? "mov" : "mp4";
}
