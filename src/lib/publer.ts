import type { SupabaseClient } from "@supabase/supabase-js";
import { urlR2 } from "@/lib/media";

// Programacion automatica en Publer de los videos aprobados.
// Reglas (hora de Espana) por cada cuenta de Instagram y dia:
//   09:00 reel en la cuadricula · 14:00 trial reel · 18:30 reel en la cuadricula · 19:00 trial reel
// Para cambiar el ritmo basta con editar SLOTS.

export const ZONA = "Europe/Madrid";
export const SLOTS: Array<{ hora: string; trial: boolean }> = [
  { hora: "09:00", trial: false },
  { hora: "14:00", trial: true },
  { hora: "18:30", trial: false },
  { hora: "19:00", trial: true },
];

const BASE = process.env.PUBLER_BASE_URL ?? "https://app.publer.com/api/v1";
const DIAS_VISTA = 60;
const MARGEN_MIN = 15; // no se programa nada a menos de 15 min de ahora

export function publerActivo() {
  return Boolean(process.env.PUBLER_API_KEY && process.env.PUBLER_WORKSPACE_ID);
}

function cabeceras() {
  return {
    Authorization: `Bearer-API ${process.env.PUBLER_API_KEY}`,
    "Publer-Workspace-Id": process.env.PUBLER_WORKSPACE_ID as string,
    "Content-Type": "application/json",
  };
}

async function publer<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...cabeceras(), ...(init?.headers ?? {}) } });
  const texto = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* respuesta no JSON */
  }
  if (!res.ok) {
    const errores = (json as { errors?: string[] } | null)?.errors;
    throw new Error(`Publer ${res.status}: ${errores?.join(", ") ?? texto.slice(0, 200)}`);
  }
  return json as T;
}

// ---------- Hora de Espana ----------

function partesMadrid(fecha: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
  return f; // YYYY-MM-DD
}

function offsetMadrid(fecha: Date) {
  const n = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, timeZoneName: "longOffset" })
    .formatToParts(fecha)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT+02:00" | "GMT+1"
  const m = n?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "+01:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
}

/** Instante UTC de "YYYY-MM-DD HH:mm" en hora de Madrid. */
export function instanteMadrid(dia: string, hora: string): Date {
  const aprox = new Date(`${dia}T${hora}:00Z`);
  const off = offsetMadrid(new Date(aprox.getTime() - 3600000)); // offset alrededor de esa fecha
  const real = new Date(`${dia}T${hora}:00${off}`);
  // corrige si el offset cambia justo ese dia (cambio de hora)
  const off2 = offsetMadrid(real);
  return off2 === off ? real : new Date(`${dia}T${hora}:00${off2}`);
}

export function isoMadrid(fecha: Date) {
  const dia = partesMadrid(fecha);
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha);
  return `${dia}T${hora}${offsetMadrid(fecha)}`;
}

// ---------- Huecos ----------

type Cuenta = { id: string; username: string };

/** Primer hueco libre (mirando todas las cuentas dadas). Ocupados: Set "cuentaId|ISO-minuto". */
export function siguienteHueco(cuentas: Cuenta[], ocupados: Set<string>, desde = new Date()) {
  const limite = desde.getTime() + MARGEN_MIN * 60000;
  const hoy = new Date(desde.getTime());
  for (let d = 0; d < DIAS_VISTA; d++) {
    const dia = partesMadrid(new Date(hoy.getTime() + d * 86400000));
    for (const slot of SLOTS) {
      const instante = instanteMadrid(dia, slot.hora);
      if (instante.getTime() < limite) continue;
      const clave = instante.toISOString().slice(0, 16);
      for (const c of cuentas) {
        if (!ocupados.has(`${c.id}|${clave}`)) return { cuenta: c, instante, trial: slot.trial };
      }
    }
  }
  return null;
}

// ---------- Publer ----------

type CuentaPubler = { id: string; name: string; provider: string; social_id?: string };

function normal(s: string) {
  return s.toLowerCase().replace(/^@/, "").trim();
}

export async function cuentasPublerInstagram(): Promise<CuentaPubler[]> {
  const r = await publer<CuentaPubler[] | { accounts: CuentaPubler[] }>("/accounts");
  const lista = Array.isArray(r) ? r : r.accounts;
  return (lista ?? []).filter((a) => a.provider === "instagram");
}

async function esperarJob(jobId: string, maxSeg = 90): Promise<unknown> {
  for (let i = 0; i < maxSeg / 3; i++) {
    const r = await publer<Record<string, unknown>>(`/job_status/${jobId}`);
    const data = (r.data as Record<string, unknown> | undefined) ?? r;
    const estado = String(data.status ?? (data.result as Record<string, unknown> | undefined)?.status ?? "");
    if (estado === "complete" || estado === "completed") return data;
    if (estado === "failed") throw new Error(`Publer: el trabajo ${jobId} fallo: ${JSON.stringify(data).slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Publer tarda demasiado en procesar el video");
}

/** Busca en cualquier parte de la respuesta un objeto de media {id, path?, type?}. */
function extraerMedia(nodo: unknown): { id: string; path?: string; type?: string; thumbnails?: unknown; default_thumbnail?: number } | null {
  if (!nodo || typeof nodo !== "object") return null;
  const o = nodo as Record<string, unknown>;
  if (typeof o.id === "string" && ("path" in o || "thumbnails" in o || o.type === "video")) return o as never;
  for (const v of Object.values(o)) {
    const r = extraerMedia(v);
    if (r) return r;
  }
  return null;
}

async function subirVideo(url: string, nombre: string) {
  const job = await publer<{ job_id: string }>("/media/from-url", {
    method: "POST",
    body: JSON.stringify({ media: [{ url, name: nombre }], type: "single", direct_upload: true, in_library: false }),
  });
  const resultado = await esperarJob(job.job_id);
  const media = extraerMedia(resultado);
  if (!media) throw new Error("Publer no devolvio el id del video subido");
  return media;
}

export type ResultadoProgramar =
  | { ok: true; programado_at: string; trial: boolean; cuenta: string }
  | { ok: false; motivo: "publer_inactivo" | "sin_cuentas" | "sin_video" | "error"; mensaje: string };

/** Programa una pieza aprobada en el siguiente hueco libre de las cuentas de su modelo. */
export async function programarPieza(supabase: SupabaseClient, piezaId: string): Promise<ResultadoProgramar> {
  if (!publerActivo()) {
    return { ok: false, motivo: "publer_inactivo", mensaje: "Publer no esta activo: descarga el video y subelo tu." };
  }
  try {
    const { data: pieza } = await supabase
      .from("library_content")
      .select("id, modelo_id, cuenta_id, caption, video_procesado_url, r2_key, estado, publicado_at")
      .eq("id", piezaId)
      .single();
    if (!pieza) return { ok: false, motivo: "error", mensaje: "Pieza no encontrada" };
    const videoUrl = urlR2(pieza.video_procesado_url);
    if (!videoUrl) return { ok: false, motivo: "sin_video", mensaje: "La pieza no tiene video editado" };

    const { data: cuentasIG } = await supabase
      .from("cuentas_instagram")
      .select("id, username")
      .eq("modelo_id", pieza.modelo_id)
      .eq("activa", true);
    const cuentasPub = await cuentasPublerInstagram();
    const candidatas = ((cuentasIG ?? []) as Cuenta[])
      .map((c) => ({ c, pub: cuentasPub.find((p) => normal(p.name) === normal(c.username) || normal(p.name).includes(normal(c.username))) }))
      .filter((x) => x.pub);
    if (!candidatas.length) {
      const nombres = cuentasPub.map((p) => p.name).join(", ") || "ninguna";
      return { ok: false, motivo: "sin_cuentas", mensaje: `Ninguna cuenta de Instagram de la modelo esta conectada en Publer (cuentas en Publer: ${nombres}).` };
    }

    // huecos ya ocupados en esas cuentas
    const ids = candidatas.map((x) => x.c.id);
    const { data: ocup } = await supabase
      .from("library_content")
      .select("cuenta_id, publicado_at")
      .in("cuenta_id", ids)
      .in("estado", ["aprobado", "publicado"])
      .gte("publicado_at", new Date(Date.now() - 86400000).toISOString());
    const ocupados = new Set(
      ((ocup ?? []) as Array<{ cuenta_id: string; publicado_at: string }>).map((o) => `${o.cuenta_id}|${new Date(o.publicado_at).toISOString().slice(0, 16)}`),
    );

    const hueco = siguienteHueco(candidatas.map((x) => x.c), ocupados);
    if (!hueco) return { ok: false, motivo: "error", mensaje: "No hay huecos libres en los proximos 60 dias" };
    const pub = candidatas.find((x) => x.c.id === hueco.cuenta.id)!.pub!;

    const media = await subirVideo(videoUrl, `${piezaId}.mp4`);
    const job = await publer<{ job_id: string }>("/posts/schedule", {
      method: "POST",
      body: JSON.stringify({
        bulk: {
          state: "scheduled",
          posts: [
            {
              networks: {
                instagram: {
                  type: "video",
                  text: pieza.caption ?? "",
                  media: [{ id: media.id, path: media.path, type: "video", thumbnails: media.thumbnails, default_thumbnail: media.default_thumbnail ?? 0 }],
                  details: {
                    type: "reel",
                    ...(hueco.trial ? { trial_reel: process.env.PUBLER_TRIAL_MODE ?? "SS_PERFORMANCE" } : {}),
                  },
                },
              },
              accounts: [{ id: pub.id, scheduled_at: isoMadrid(hueco.instante) }],
            },
          ],
        },
      }),
    });
    const fin = (await esperarJob(job.job_id)) as { payload?: { failures?: Record<string, unknown> }; result?: { payload?: { failures?: Record<string, unknown> } } };
    const fallos = fin.payload?.failures ?? fin.result?.payload?.failures;
    if (fallos && Object.keys(fallos).length) throw new Error(`Publer rechazo la publicacion: ${JSON.stringify(fallos).slice(0, 300)}`);

    const programado = hueco.instante.toISOString();
    await supabase
      .from("library_content")
      .update({ cuenta_id: hueco.cuenta.id, publicado_at: programado, error_mensaje: null, updated_at: new Date().toISOString() })
      .eq("id", piezaId);
    return { ok: true, programado_at: programado, trial: hueco.trial, cuenta: hueco.cuenta.username };
  } catch (e) {
    return { ok: false, motivo: "error", mensaje: e instanceof Error ? e.message : "Error programando en Publer" };
  }
}

let ocupado = false;

/** Programa todas las aprobadas que aun no tienen fecha (p. ej. las aprobadas antes de activar Publer). */
export async function programarPendientes(supabase: SupabaseClient, limite = 10) {
  if (ocupado || !publerActivo()) return 0;
  ocupado = true;
  try {
    const { data } = await supabase
      .from("library_content")
      .select("id")
      .eq("estado", "aprobado")
      .is("publicado_at", null)
      .not("video_procesado_url", "is", null)
      .order("aprobado_at", { ascending: true })
      .limit(limite);
    let n = 0;
    for (const p of data ?? []) {
      const r = await programarPieza(supabase, p.id as string);
      if (r.ok) n++;
      else if (r.motivo === "sin_cuentas" || r.motivo === "publer_inactivo") break;
    }
    return n;
  } finally {
    ocupado = false;
  }
}

/** Las aprobadas cuya hora de publicacion ya paso pasan a "publicado". */
export async function marcarPublicadas(supabase: SupabaseClient) {
  await supabase
    .from("library_content")
    .update({ estado: "publicado", updated_at: new Date().toISOString() })
    .eq("estado", "aprobado")
    .not("publicado_at", "is", null)
    .lte("publicado_at", new Date().toISOString());
}
