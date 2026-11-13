/**
 * «Subir mi propio original» en Trial reels. El panel sube el video en trozos de 4 MB (subidas-trial/<codigo>/00001…; R2 no responde desde algunas redes
 * y una funcion del servidor del panel no admite mas de ~4,5 MB por peticion) y apunta la subida en panel_config.trial_subidas.
 * Aqui se unen los trozos en un solo archivo, se guarda el original en R2 (propios/<usuario>/<codigo>.<ext>), se da de alta como viral propio ya APROBADO
 * (asi se comporta como cualquier otro original en Trial reels) y, si se pidio, se lanza el pedido de trial reels. Despues se borran los trozos.
 */
import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.mjs";
import { borrarDeR2, listarClaves, s3, uploadToR2 } from "./r2.mjs";

const CLAVE = "trial_subidas";
const CLAVE_PEDIDOS = "trial_reels_pedidos";
const ATASCADA_MS = 25 * 60 * 1000;
const CONTENT_TYPE = { mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo", "3gp": "video/3gpp" };

async function leer(sb, clave, campo) {
  const { data } = await sb.from("panel_config").select("value, updated_at").eq("key", clave).maybeSingle();
  return { lista: Array.isArray(data?.value?.[campo]) ? data.value[campo] : [], updated_at: data?.updated_at ?? null };
}

/** Cambia la lista con «comparar y cambiar» (el panel tambien escribe en ella). fn recibe la lista y devuelve la nueva (o null si no hay nada que cambiar). */
async function cambiarLista(sb, clave, campo, fn) {
  for (let i = 0; i < 6; i++) {
    const { lista, updated_at } = await leer(sb, clave, campo);
    const nueva = fn(lista);
    if (nueva === null) return true;
    const ahora = new Date().toISOString();
    if (!updated_at) {
      const { error } = await sb.from("panel_config").insert({ key: clave, value: { [campo]: nueva }, updated_at: ahora });
      if (!error) return true;
    } else {
      const { data } = await sb.from("panel_config").update({ value: { [campo]: nueva }, updated_at: ahora }).eq("key", clave).eq("updated_at", updated_at).select("key");
      if (data?.length) return true;
    }
  }
  return false;
}

const cambiarSubida = (sb, codigo, fn) => cambiarLista(sb, CLAVE, "subidas", (l) => (l.some((s) => s.codigo === codigo) ? l.map((s) => (s.codigo === codigo ? fn({ ...s }) : s)) : null));

async function descargarTrozo(clave, destino) {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: clave }));
  await new Promise((ok, fallo) => {
    Body.on("error", fallo);
    Body.on("end", ok);
    Body.pipe(destino, { end: false });
  });
}

/**
 * Un video de una modelo elegido en «Editar videos» → «Crear trial reels» (marca [trial=N] en notas_editor): cuando el editor termina de editarlo,
 * el video EDITADO se da de alta como original de Trial reels (viral propio aprobado, codigo sub-…) y se piden sus N versiones. Devuelve el id del viral.
 */
export async function trialDesdeEditado(sb, pieza, claveEditado, cantidad) {
  const { data: p } = await sb.from("library_content").select("titulo, filename_original").eq("id", pieza.id).maybeSingle();
  const ahora = new Date().toISOString();
  const codigo = `sub-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const { data: viral, error } = await sb
    .from("virales_propios")
    .insert({ cuenta_id: pieza.cuenta_id, modelo_id: pieza.modelo_id, codigo, video_key: claveEditado, descripcion: p?.filename_original ?? p?.titulo ?? null, vistas: 0, likes: 0, comentarios: 0, compartidos: 0, fecha_publicacion: ahora, estado: "aprobado", aprobado_at: ahora })
    .select("id")
    .single();
  if (error) throw new Error(`no se pudo dar de alta el original para trial: ${error.message}`);
  const ok = await cambiarLista(sb, CLAVE_PEDIDOS, "pedidos", (l) => [...l, { id: randomUUID(), viral_id: viral.id, modelo_id: pieza.modelo_id, cantidad: Math.min(3, Math.max(1, Number(cantidad) || 3)), estado: "pendiente", at: new Date().toISOString(), por: "Editar vídeos", variantes: [] }]);
  if (!ok) throw new Error("no se pudo pedir las versiones de trial");
  return viral.id;
}

let ocupado = false;
let ultimaLimpieza = 0;

export async function cicloSubidasTrial(sb) {
  if (ocupado) return;
  ocupado = true;
  try {
    const { lista } = await leer(sb, CLAVE, "subidas");
    const ahora = Date.now();
    for (const s of lista.filter((x) => x.estado === "procesando" && ahora - new Date(x.empezado_at ?? 0).getTime() > ATASCADA_MS)) {
      await cambiarSubida(sb, s.codigo, (x) => ({ ...x, estado: "pendiente" })); // se cayo a mitad: se reintenta
    }
    for (const s of lista.filter((x) => x.estado === "pendiente").sort((a, b) => String(a.at).localeCompare(String(b.at)))) await procesar(sb, s);

    // Trozos abandonados (alguien empezo a subir y no termino): fuera a los 2 dias. Una vez por hora.
    if (ahora - ultimaLimpieza > 3600000) {
      ultimaLimpieza = ahora;
      await limpiarAbandonados(sb);
    }
  } catch (e) {
    console.error("[subidas-trial] error inesperado:", e.message);
  } finally {
    ocupado = false;
  }
}

async function procesar(sb, s) {
  const en = await cambiarSubida(sb, s.codigo, (x) => ({ ...x, estado: "procesando", empezado_at: new Date().toISOString(), error: null }));
  if (!en) return;
  const dir = path.join(config.tmpDir, "subidas-trial");
  const local = path.join(dir, `${s.codigo}.${s.ext}`);
  const keyOriginal = `propios/${s.usuario}/${s.codigo}.${s.ext}`;
  try {
    await mkdir(dir, { recursive: true });
    const claves = (await listarClaves(`subidas-trial/${s.codigo}/`)).sort();
    if (claves.length !== s.partes) throw new Error(`Faltan trozos del vídeo (${claves.length} de ${s.partes}). Hay que volver a subirlo.`);
    const salida = createWriteStream(local);
    try {
      for (const k of claves) await descargarTrozo(k, salida);
    } finally {
      await new Promise((ok) => salida.end(ok));
    }
    const { size } = await stat(local);
    if (size !== s.size) throw new Error(`El vídeo llegó incompleto (${size} de ${s.size} bytes). Hay que volver a subirlo.`);

    await uploadToR2(local, keyOriginal, CONTENT_TYPE[s.ext] ?? "video/mp4");

    // Alta como viral propio ya aprobado (se ve en Trial reels como cualquier otro original)
    const ahora = new Date().toISOString();
    const { data: previo } = await sb.from("virales_propios").select("id").eq("cuenta_id", s.cuenta_id).eq("codigo", s.codigo).maybeSingle();
    let viralId = previo?.id ?? null;
    if (!viralId) {
      const { data: nuevo, error } = await sb
        .from("virales_propios")
        .insert({ cuenta_id: s.cuenta_id, modelo_id: s.modelo_id, codigo: s.codigo, video_key: keyOriginal, descripcion: s.descripcion || s.nombre, vistas: 0, likes: 0, comentarios: 0, compartidos: 0, fecha_publicacion: ahora, estado: "aprobado", aprobado_at: ahora })
        .select("id")
        .single();
      if (error) throw new Error(`No se pudo guardar el original: ${error.message}`);
      viralId = nuevo.id;
    }

    // Trial reels de ese original, si se pidieron
    if (s.generar) {
      await cambiarLista(sb, CLAVE_PEDIDOS, "pedidos", (l) => {
        if (l.some((p) => p.viral_id === viralId && (p.estado === "pendiente" || p.estado === "procesando"))) return null;
        return [...l, { id: randomUUID(), viral_id: viralId, modelo_id: s.modelo_id, cantidad: Math.min(3, Math.max(1, Number(s.cantidad) || 3)), estado: "pendiente", at: new Date().toISOString(), por: s.por, variantes: [] }];
      });
    }

    await cambiarLista(sb, CLAVE, "subidas", (l) => (l.some((x) => x.codigo === s.codigo) ? l.filter((x) => x.codigo !== s.codigo) : null));
    for (const k of claves) await borrarDeR2(k).catch(() => undefined);
    console.log(`[subidas-trial] ${s.usuario}/${s.codigo}: original guardado (${(size / 1e6).toFixed(0)} MB)${s.generar ? `, ${s.cantidad} trial reel(s) pedidos` : ""}`);
  } catch (e) {
    console.error(`[subidas-trial] ${s.codigo}: ${e.message}`);
    await cambiarSubida(sb, s.codigo, (x) => ({ ...x, estado: "error", error: String(e.message).slice(0, 300) }));
  } finally {
    await rm(local, { force: true }).catch(() => undefined);
  }
}

async function limpiarAbandonados(sb) {
  const { lista } = await leer(sb, CLAVE, "subidas");
  const apuntadas = new Set(lista.map((s) => s.codigo));
  const limite = Date.now() - 2 * 86400000;
  const claves = await listarClaves("subidas-trial/");
  for (const k of claves) {
    const codigo = k.split("/")[1];
    if (apuntadas.has(codigo)) continue;
    // Solo se borra lo que lleva mas de 2 dias en el almacen
    const cab = await s3.send(new HeadObjectCommand({ Bucket: config.r2Bucket, Key: k })).catch(() => null);
    if (cab?.LastModified && cab.LastModified.getTime() < limite) await borrarDeR2(k).catch(() => undefined);
  }
}
