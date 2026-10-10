import { createAdminClient } from "@/lib/supabase/server";

// RONDAS de la extension "HALO Virales": cuando se analizan las cuentas de referencia, todas las extensiones (la tuya, la de tu
// socio, la del lunes automatico) trabajan sobre UNA MISMA ronda: cada cuenta la coge una sola persona y las demas pasan a la
// siguiente. Asi nadie espera en cola, no se analiza dos veces lo mismo y, si estais los dos, se reparte el trabajo.
// Se guarda en panel_config (sin tabla nueva). Las escrituras usan "comparar y cambiar" (updated_at) para que dos extensiones
// pidiendo cuenta a la vez no se pisen.

const CLAVE_RONDA = "ronda_virales";
const CLAVE_SEMANAL = "ronda_semanal";
const CADUCA_CUENTA_MS = 8 * 60000; // una cuenta tomada que no se termina en 8 min (Chrome cerrado...) vuelve a quedar libre
const RONDA_VIVA_MS = 20 * 60000; // una ronda sin actividad en 20 min se da por abandonada: la siguiente persona empieza otra
export const HORA_RONDA_SEMANAL = 8; // lunes a las 8:00 (hora de Madrid)

export type CuentaRonda = { id: string; username: string; categoria: string | null; etiqueta: string };
export type Ronda = {
  id: string;
  modo: "referencias";
  categoria: string;
  dias: number;
  origen: "manual" | "lunes";
  semana: string | null; // semana ISO de Madrid (solo en las del lunes)
  creada_at: string;
  creada_por: string;
  actualizada_at: string;
  finalizada_at: string | null;
  cuentas: CuentaRonda[];
  tomadas: Record<string, { por: string; at: string }>;
  hechas: Record<string, { por: string; at: string; nuevos: number; ok: boolean }>;
};

type Fila = { value: Ronda | null; updated_at: string | null };

async function leerFila(): Promise<Fila> {
  const { data } = await createAdminClient().from("panel_config").select("value, updated_at").eq("key", CLAVE_RONDA).maybeSingle();
  return { value: (data?.value as Ronda | undefined) ?? null, updated_at: (data?.updated_at as string | undefined) ?? null };
}

/** Escribe solo si nadie la ha cambiado desde que se leyo. */
async function guardarSiIgual(previo: Fila, valor: Ronda): Promise<boolean> {
  const db = createAdminClient();
  const ahora = new Date().toISOString();
  if (!previo.updated_at) {
    const { error } = await db.from("panel_config").insert({ key: CLAVE_RONDA, value: valor, updated_at: ahora });
    return !error;
  }
  const { data, error } = await db.from("panel_config").update({ value: valor, updated_at: ahora }).eq("key", CLAVE_RONDA).eq("updated_at", previo.updated_at).select("key");
  return !error && (data?.length ?? 0) > 0;
}

/** Aplica un cambio a la ronda con reintentos si otra extension escribio a la vez. `cambiar` devuelve la ronda nueva (o null = no tocar) y lo que se responde. */
async function mutar<T>(cambiar: (actual: Ronda | null) => { ronda: Ronda | null; respuesta: T }): Promise<T> {
  for (let intento = 0; intento < 8; intento++) {
    const previo = await leerFila();
    const { ronda, respuesta } = cambiar(previo.value);
    if (!ronda) return respuesta;
    if (await guardarSiIgual(previo, ronda)) return respuesta;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new Error("No se pudo coordinar la ronda (demasiadas peticiones a la vez). Prueba otra vez.");
}

const fresca = (iso: string, ms: number) => Date.now() - new Date(iso).getTime() < ms;
const libre = (r: Ronda, id: string) => !r.hechas[id] && !(r.tomadas[id] && fresca(r.tomadas[id].at, CADUCA_CUENTA_MS));
const viva = (r: Ronda | null): r is Ronda => Boolean(r && !r.finalizada_at && fresca(r.actualizada_at, RONDA_VIVA_MS));

/** Lo que necesita la extension para pintar el avance: quien ha hecho / lleva cada cuenta. */
function vista(r: Ronda) {
  return {
    id: r.id,
    origen: r.origen,
    creada_por: r.creada_por,
    cuentas: r.cuentas,
    hechas: Object.fromEntries(Object.entries(r.hechas).map(([id, h]) => [id, { por: h.por, nuevos: h.nuevos, ok: h.ok }])),
    tomadas: Object.fromEntries(Object.entries(r.tomadas).filter(([, t]) => fresca(t.at, CADUCA_CUENTA_MS)).map(([id, t]) => [id, { por: t.por }])),
    finalizada: Boolean(r.finalizada_at),
  };
}
export type VistaRonda = ReturnType<typeof vista>;

/** Entra en la ronda en marcha (misma busqueda) o abre una nueva con las cuentas dadas. */
export async function unirseARonda(p: { usuario: string; categoria: string; dias: number; origen: "manual" | "lunes"; semana: string | null; cuentas: CuentaRonda[] }) {
  return mutar<{ unida: boolean; ronda: VistaRonda }>((actual) => {
    if (viva(actual) && actual.categoria === p.categoria) {
      // Si ya hay una ronda manual de TODAS las cuentas en marcha, la del lunes se apunta a esa (ya cubre lo mismo) en vez de repetirla
      if (p.origen === "lunes" && actual.origen !== "lunes" && actual.categoria === "todas") {
        const adoptada: Ronda = { ...actual, origen: "lunes", semana: p.semana };
        return { ronda: adoptada, respuesta: { unida: true, ronda: vista(adoptada) } };
      }
      return { ronda: null, respuesta: { unida: true, ronda: vista(actual) } };
    }
    const ahora = new Date().toISOString();
    const nueva: Ronda = {
      id: crypto.randomUUID(),
      modo: "referencias",
      categoria: p.categoria,
      dias: p.dias,
      origen: p.origen,
      semana: p.semana,
      creada_at: ahora,
      creada_por: p.usuario,
      actualizada_at: ahora,
      finalizada_at: null,
      cuentas: p.cuentas,
      tomadas: {},
      hechas: {},
    };
    return { ronda: nueva, respuesta: { unida: false, ronda: vista(nueva) } };
  });
}

/** Reparte la siguiente cuenta libre. Sin cuenta = no queda nada por tomar (o lo que queda lo llevan otros). */
export async function siguienteCuenta(rondaId: string, usuario: string) {
  return mutar<{ cuenta: CuentaRonda | null; otros: number; ronda: VistaRonda | null }>((r) => {
    if (!r || r.id !== rondaId) return { ronda: null, respuesta: { cuenta: null, otros: 0, ronda: null } };
    const pendiente = r.cuentas.find((c) => libre(r, c.id));
    const ahora = new Date().toISOString();
    if (pendiente) {
      const n: Ronda = { ...r, actualizada_at: ahora, tomadas: { ...r.tomadas, [pendiente.id]: { por: usuario, at: ahora } } };
      return { ronda: n, respuesta: { cuenta: pendiente, otros: 0, ronda: vista(n) } };
    }
    const otros = r.cuentas.filter((c) => !r.hechas[c.id]).length;
    const cerrar = otros === 0 && !r.finalizada_at;
    const n = cerrar ? { ...r, actualizada_at: ahora, finalizada_at: ahora } : r;
    return { ronda: cerrar ? n : null, respuesta: { cuenta: null, otros, ronda: vista(n) } };
  });
}

/** Una cuenta terminada (ok o con error propio de la cuenta). Si era la ultima, cierra la ronda (y la del lunes queda como hecha). */
export async function cuentaHecha(rondaId: string, cuentaId: string, usuario: string, nuevos: number, ok: boolean) {
  const resultado = await mutar<{ ronda: VistaRonda | null; cerrada: Ronda | null }>((r) => {
    if (!r || r.id !== rondaId) return { ronda: null, respuesta: { ronda: null, cerrada: null } };
    const ahora = new Date().toISOString();
    const tomadas = { ...r.tomadas };
    delete tomadas[cuentaId];
    const hechas = { ...r.hechas, [cuentaId]: { por: usuario, at: ahora, nuevos: Math.max(0, Math.round(nuevos) || 0), ok } };
    const completa = r.cuentas.every((c) => hechas[c.id]);
    const n: Ronda = { ...r, actualizada_at: ahora, tomadas, hechas, finalizada_at: completa ? ahora : r.finalizada_at };
    return { ronda: n, respuesta: { ronda: vista(n), cerrada: completa && !r.finalizada_at ? n : null } };
  });
  if (resultado.cerrada?.origen === "lunes" && resultado.cerrada.semana) {
    const nuevosTotal = Object.values(resultado.cerrada.hechas).reduce((s, h) => s + h.nuevos, 0);
    await createAdminClient().from("panel_config").upsert({
      key: CLAVE_SEMANAL,
      value: { semana: resultado.cerrada.semana, ronda_id: resultado.cerrada.id, completada_at: resultado.cerrada.finalizada_at, cuentas: resultado.cerrada.cuentas.length, nuevos: nuevosTotal },
      updated_at: new Date().toISOString(),
    });
  }
  return resultado.ronda;
}

/** Devuelve una cuenta al montón (se cancelo o Instagram pidio parar): otra extension la puede coger. */
export async function devolverCuenta(rondaId: string, cuentaId: string) {
  await mutar<null>((r) => {
    if (!r || r.id !== rondaId || !r.tomadas[cuentaId]) return { ronda: null, respuesta: null };
    const tomadas = { ...r.tomadas };
    delete tomadas[cuentaId];
    return { ronda: { ...r, tomadas }, respuesta: null };
  });
}

/* ------------------------------- ronda semanal ------------------------------- */

const DIAS_SEMANA: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Ahora en Madrid: dia de la semana (1 = lunes), hora y semana ISO ("2026-W41"). */
export function ahoraMadrid(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  const dia = DIAS_SEMANA[partes.weekday] ?? 1;
  const hora = Number(partes.hour);
  // Semana ISO a partir de la fecha de Madrid
  const d = new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
  const jueves = new Date(d);
  jueves.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAnio = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((jueves.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
  return { dia, hora, semana: `${jueves.getUTCFullYear()}-W${String(semana).padStart(2, "0")}` };
}

export type EstadoSemanal = { semana: string; debeCorrer: boolean; hecha: boolean; completada_at: string | null; cuentas: number | null; nuevos: number | null; ronda: { hechas: number; total: number } | null };

/**
 * ¿Toca la ronda de esta semana? Desde el lunes a las 8:00 (hora de Madrid) y hasta que se complete: si el lunes no habia ningun
 * Chrome con la extension abierto, la primera que se abra despues la hace (recupera el retraso).
 */
export async function estadoSemanal(): Promise<EstadoSemanal> {
  const { dia, hora, semana } = ahoraMadrid();
  const db = createAdminClient();
  const { data } = await db.from("panel_config").select("value").eq("key", CLAVE_SEMANAL).maybeSingle();
  const s = data?.value as { semana?: string; completada_at?: string; cuentas?: number; nuevos?: number } | undefined;
  const hecha = s?.semana === semana && Boolean(s.completada_at);
  const ronda = (await leerFila()).value;
  const deEstaSemana = ronda && ronda.origen === "lunes" && ronda.semana === semana ? ronda : null;
  const llegoLaHora = dia > 1 || hora >= HORA_RONDA_SEMANAL;
  return {
    semana,
    hecha,
    debeCorrer: !hecha && llegoLaHora,
    completada_at: hecha ? (s?.completada_at ?? null) : null,
    cuentas: hecha ? (s?.cuentas ?? null) : null,
    nuevos: hecha ? (s?.nuevos ?? null) : null,
    ronda: deEstaSemana ? { hechas: Object.keys(deEstaSemana.hechas).length, total: deEstaSemana.cuentas.length } : null,
  };
}
