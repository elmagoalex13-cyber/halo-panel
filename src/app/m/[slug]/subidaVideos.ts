// Motor de subida de videos del portal de la modelo. Vive FUERA de los componentes: la subida sigue aunque la modelo cambie de pestaña dentro del portal
// (antes, al salir de «Subir videos» el boton desaparecia y la subida se perdia de vista), se ven todos los videos en una cola con su avance, velocidad y
// tiempo que queda, y lo que se corta se reintenta o se RETOMA por donde iba (la subida por partes se guarda en el movil y el servidor dice que partes ya estan).
import * as tus from "tus-js-client";

export type EstadoItem = "cola" | "subiendo" | "ok" | "repetido" | "error";
export type ItemSubida = { id: string; ctx: string; nombre: string; size: number; estado: EstadoItem; subido: number; motivo?: string };
export type EstadoSubidas = { items: ItemSubida[]; velocidad: number; version: number };
export type OpcionesSubida = { tipo: number; encargoId?: string; referenciaId?: string };

type Interno = ItemSubida & { file: File; opc: OpcionesSubida };
type Preparada =
  | { provider: "supabase"; bucket: string; path: string; token: string; key: string; contentType: string; uploadEndpoint: string | null }
  | { provider: "r2-multipart"; key: string; uploadId: string; partSize: number; parts: Array<{ partNumber: number; url: string }>; hechas?: Array<{ partNumber: number; etag: string }>; contentType: string };

class ErrorFinal extends Error {}
class ErrorTemporal extends Error {}

const CONCURRENCIA = 3; // videos a la vez
const PARTES_A_LA_VEZ = 4; // trozos a la vez de cada video
const VACIO: EstadoSubidas = { items: [], velocidad: 0, version: 0 };

let internos: Interno[] = [];
let instantanea: EstadoSubidas = VACIO;
const oyentes = new Set<() => void>();
let contador = 0;
let muestras: Array<{ t: number; b: number }> = [];
let ultimaEmision = 0;
let pantalla: { release: () => Promise<void> } | null = null;

/* ------------------------------------------------------------ estado observable ------------------------------------------------------------ */

export const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};
export const obtener = () => instantanea;
export const obtenerServidor = () => VACIO;

function velocidad(): number {
  const ahora = Date.now();
  const total = internos.reduce((s, i) => s + i.subido, 0);
  muestras.push({ t: ahora, b: total });
  muestras = muestras.filter((m) => ahora - m.t <= 8000);
  const a = muestras[0];
  const z = muestras[muestras.length - 1];
  if (!a || z.t - a.t < 1500) return instantanea.velocidad;
  return Math.max(0, (z.b - a.b) / ((z.t - a.t) / 1000));
}

function emitir(forzar = true) {
  const ahora = Date.now();
  if (!forzar && ahora - ultimaEmision < 250) return; // el avance llega muchas veces por segundo: se ensena unas 4
  ultimaEmision = ahora;
  instantanea = {
    items: internos.map((i) => ({ id: i.id, ctx: i.ctx, nombre: i.nombre, size: i.size, estado: i.estado, subido: i.subido, motivo: i.motivo })),
    velocidad: velocidad(),
    version: instantanea.version + 1,
  };
  oyentes.forEach((f) => f());
}

/* ------------------------------------------------------------ utilidades ------------------------------------------------------------ */

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function conReintentos<T>(fn: () => Promise<T>, intentos: number): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErrorFinal) throw e;
      ultimo = e;
      if (i < intentos - 1) await esperar(600 * 2 ** i);
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Error al subir");
}

/** Mensaje claro para la modelo (sin palabras tecnicas). */
function textoError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (e instanceof ErrorFinal) return m;
  if (/load failed|failed to fetch|network|conexion|conexión|se corto|timeout|abort/i.test(m) || !m) return "Se cortó la conexión mientras subía.";
  if (/subida fallo|confirmacion|confirmación|finalizar|preparar|registrar/i.test(m)) return "No se pudo completar la subida en este momento.";
  return `${m}.`;
}

const huella = (f: File) => `halo_subida:${f.name}|${f.size}|${f.lastModified}`;
const leerGuardado = (f: File): { key: string; uploadId: string } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(huella(f)) ?? "null") as { key?: string; uploadId?: string } | null;
    return v?.key && v.uploadId ? { key: v.key, uploadId: v.uploadId } : null;
  } catch {
    return null;
  }
};
const guardar = (f: File, v: { key: string; uploadId: string }) => {
  try {
    localStorage.setItem(huella(f), JSON.stringify(v));
  } catch {
    /* sin almacenamiento: no se podra retomar, pero sube igual */
  }
};
const olvidar = (f: File) => {
  try {
    localStorage.removeItem(huella(f));
  } catch {
    /* nada */
  }
};

async function actualizarPantalla() {
  const hayTrabajo = internos.some((i) => i.estado === "cola" || i.estado === "subiendo");
  try {
    if (hayTrabajo && !pantalla) {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      pantalla = wl ? await wl.request("screen") : null;
    } else if (!hayTrabajo && pantalla) {
      await pantalla.release();
      pantalla = null;
    }
  } catch {
    pantalla = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (internos.some((i) => i.estado === "cola" || i.estado === "subiendo")) e.preventDefault();
  });
  // Al volver a la pantalla (el movil la bloqueo y la quito) se pide otra vez que no se apague
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pantalla = null;
      void actualizarPantalla();
    }
  });
}

/* ------------------------------------------------------------ cola ------------------------------------------------------------ */

/** Anota un suceso del portal para poder ver por que falla una subida en el movil de una modelo (se guarda en el servidor; nunca rompe nada). */
export function diag(evento: string, datos?: Record<string, unknown>) {
  try {
    const cuerpo = JSON.stringify({ evento, datos });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/portal/diag", new Blob([cuerpo], { type: "application/json" }))) return;
    void fetch("/api/portal/diag", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo, keepalive: true }).catch(() => undefined);
  } catch {
    /* sin diagnostico */
  }
}

/** Anade videos a la cola y empieza a subirlos. */
export function agregar(files: File[], opc: OpcionesSubida) {
  const ctx = `${opc.tipo}|${opc.encargoId ?? ""}`;
  // El mismo video (mismo nombre, tamaño y fecha) que ya esta en la cola o subiendose no se anade otra vez (pasa cuando la modelo vuelve a elegirlo porque «no ve que pase nada»)
  const yaEsta = (f: File) => internos.some((x) => x.estado !== "error" && x.file.name === f.name && x.file.size === f.size && x.file.lastModified === f.lastModified);
  const nuevos = files.filter((f) => !yaEsta(f));
  diag("agregar", { n: files.length, nuevos: nuevos.length, tam: nuevos.map((f) => Math.round(f.size / 1e6)), tipos: nuevos.map((f) => f.type || "?") });
  nuevos.forEach((file, i) => {
    internos.push({ id: `s${++contador}`, ctx, nombre: file.name, size: file.size, estado: "cola", subido: 0, file, opc: i === 0 ? opc : { ...opc, encargoId: undefined } });
  });
  emitir();
  bombear();
}

export function reintentar(id: string) {
  const it = internos.find((i) => i.id === id);
  if (!it || it.estado !== "error") return;
  it.estado = "cola";
  it.subido = 0;
  it.motivo = undefined;
  emitir();
  bombear();
}

export function reintentarFallidos() {
  for (const it of internos) if (it.estado === "error") Object.assign(it, { estado: "cola", subido: 0, motivo: undefined });
  emitir();
  bombear();
}

/** Quita de la lista lo ya terminado (y lo fallido, si se pide). */
export function limpiar(incluirFallidos = false) {
  internos = internos.filter((i) => i.estado === "cola" || i.estado === "subiendo" || (!incluirFallidos && i.estado === "error"));
  muestras = [];
  emitir();
}

function bombear() {
  while (internos.filter((i) => i.estado === "subiendo").length < CONCURRENCIA) {
    const siguiente = internos.find((i) => i.estado === "cola");
    if (!siguiente) break;
    siguiente.estado = "subiendo";
    emitir();
    void ejecutar(siguiente);
  }
  void actualizarPantalla();
}

async function ejecutar(it: Interno) {
  try {
    const r = await subirUno(it);
    it.estado = r?.repetido ? "repetido" : "ok";
    it.subido = it.size;
    diag("subido", { mb: Math.round(it.size / 1e6), repetido: Boolean(r?.repetido) });
  } catch (e) {
    it.estado = "error";
    it.motivo = textoError(e);
    diag("error", { mb: Math.round(it.size / 1e6), msg: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200), tipo: it.file.type || "?" });
  }
  emitir();
  bombear();
}

const avance = (it: Interno, cargado: number) => {
  it.subido = Math.min(it.size, cargado);
  emitir(false);
};

/* ------------------------------------------------------------ subida de un video ------------------------------------------------------------ */

async function pedirPermiso(it: Interno): Promise<Preparada> {
  const pedir = (resume?: { key: string; uploadId: string }) =>
    fetch("/api/portal/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: it.file.name, contentType: it.file.type, size: it.file.size, resume }),
    });
  return conReintentos(async () => {
    const guardado = leerGuardado(it.file);
    let r = await pedir(guardado ?? undefined);
    if (guardado && (r.status === 409 || r.status === 400)) {
      olvidar(it.file); // esa subida ya no existe: empieza una nueva
      r = await pedir();
    }
    if (r.status === 401) throw new ErrorFinal("Tu sesión ha caducado: vuelve a entrar en tu portal y repite la subida.");
    if (!r.ok) throw new ErrorTemporal("No se pudo preparar la subida");
    return (await r.json()) as Preparada;
  }, 3);
}

async function subirUno(it: Interno): Promise<{ repetido?: boolean }> {
  const prepared = await pedirPermiso(it);
  if (prepared.provider === "r2-multipart") await subirPorPartes(it, prepared);
  else {
    if (!prepared.uploadEndpoint) throw new Error("No se pudo preparar la subida");
    await subirConTus(it, prepared as Extract<Preparada, { provider: "supabase" }> & { uploadEndpoint: string });
  }

  // El archivo YA esta en el almacen: registrarlo se reintenta (el servidor lo reconoce si ya estaba, no se duplica)
  const r = await conReintentos(async () => {
    const reg = await fetch("/api/portal/subir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: prepared.key, filename: it.file.name, size: it.file.size, tipo: it.opc.tipo, encargo_id: it.opc.encargoId, referencia_id: it.opc.referenciaId }),
    });
    if (reg.ok) return (await reg.json().catch(() => ({}))) as { repetido?: boolean };
    const j = (await reg.json().catch(() => null)) as { error?: string } | null;
    if (reg.status >= 500) throw new ErrorTemporal(j?.error ?? "No se pudo registrar el video");
    throw new ErrorFinal(reg.status === 401 ? "Tu sesión ha caducado: vuelve a entrar en tu portal." : (j?.error ?? "No se pudo registrar el video"));
  }, 4);
  olvidar(it.file);
  return r;
}

async function subirPorPartes(it: Interno, p: Extract<Preparada, { provider: "r2-multipart" }>) {
  guardar(it.file, { key: p.key, uploadId: p.uploadId }); // asi, si se corta, al volver a elegir el mismo video continua por donde iba
  const hechas = p.hechas ?? [];
  const tamParte = (n: number) => Math.max(0, Math.min(p.partSize, it.file.size - (n - 1) * p.partSize));
  const cargado = new Map<number, number>();
  for (const h of hechas) cargado.set(h.partNumber, tamParte(h.partNumber));
  const total = () => Array.from(cargado.values()).reduce((a, b) => a + b, 0);
  avance(it, total());
  const subidas: Array<{ partNumber: number; etag: string }> = [...hechas];
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARTES_A_LA_VEZ, p.parts.length) }, async () => {
      while (siguiente < p.parts.length) {
        const parte = p.parts[siguiente++];
        const ini = (parte.partNumber - 1) * p.partSize;
        const trozo = it.file.slice(ini, Math.min(ini + p.partSize, it.file.size), p.contentType);
        const etag = await conReintentos(
          () =>
            putParte(parte.url, trozo, (n) => {
              cargado.set(parte.partNumber, n);
              avance(it, total());
            }),
          4,
        );
        subidas.push({ partNumber: parte.partNumber, etag });
        cargado.set(parte.partNumber, trozo.size);
        avance(it, total());
      }
    }),
  );
  await conReintentos(async () => {
    const r = await fetch("/api/portal/r2-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: p.key, uploadId: p.uploadId, parts: subidas }) });
    if (r.ok) return;
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    if (r.status === 401) throw new ErrorFinal("Tu sesión ha caducado: vuelve a entrar en tu portal.");
    throw new ErrorTemporal(j?.error ?? "No se pudo finalizar la subida");
  }, 3);
  avance(it, it.file.size);
}

function putParte(url: string, trozo: Blob, onProgress: (n: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onerror = () => reject(new ErrorTemporal("La conexion se corto durante la subida"));
    xhr.ontimeout = () => reject(new ErrorTemporal("La conexion se corto durante la subida"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new ErrorTemporal(`La subida fallo (${xhr.status})`));
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) return reject(new ErrorTemporal("El almacen no devolvio confirmacion de la parte subida"));
      resolve(etag);
    };
    xhr.send(trozo);
  });
}

function subirConTus(it: Interno, p: Extract<Preparada, { provider: "supabase" }> & { uploadEndpoint: string }) {
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(it.file, {
      endpoint: p.uploadEndpoint,
      retryDelays: [0, 1500, 3000, 6000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: p.bucket, objectName: p.path, contentType: p.contentType, cacheControl: "3600" },
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "x-signature": p.token },
      onError: (error) => reject(new Error(error.message || "La subida fallo, prueba otra vez")),
      onProgress: (n) => avance(it, n),
      onSuccess: () => {
        avance(it, it.file.size);
        resolve();
      },
    });
    upload
      .findPreviousUploads()
      .then((previas) => {
        if (previas.length) upload.resumeFromPreviousUpload(previas[0]);
        upload.start();
      })
      .catch((error) => reject(error instanceof Error ? error : new Error("La subida fallo, prueba otra vez")));
  });
}
