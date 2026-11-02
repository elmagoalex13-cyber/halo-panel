/**
 * Vigilancia para que nada se pare sin que te enteres, y para que no haya sustos de facturacion:
 *  - Supabase: cada 5 min comprueba que responde. Si lo restringe por pasarse de cupo (error 402) o deja de contestar, te avisa por Telegram
 *    DIRECTAMENTE (sin usar la base de datos, que es justo lo que estaria caido). Cuando vuelve, te lo dice.
 *  - Cloudflare R2: cada 12 h mide cuanto ocupa el almacen (por carpeta), lo guarda en panel_config.r2_uso y te avisa por Telegram si se acerca al
 *    tramo gratuito (10 GB) o lo supera, con el coste estimado. R2 no cobra por descargas, solo por lo que ocupa (0,015 $/GB al mes sobre los 10 GB gratis).
 *    Tambien cancela las subidas por partes que se quedaron a medias hace mas de 36 h (sus trozos cuentan como espacio ocupado y nadie los usa).
 */
import { AbortMultipartUploadCommand, GetBucketLifecycleConfigurationCommand, ListMultipartUploadsCommand, ListObjectsV2Command, PutBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";
import { config } from "./config.mjs";
import { s3 } from "./r2.mjs";
import { enviar } from "./telegram.mjs";

const GB = 1e9;
const AVISO_GB = Number(process.env.R2_AVISO_GB) > 0 ? Number(process.env.R2_AVISO_GB) : 8; // aviso antes de llegar a los 10 GB gratis
const GRATIS_GB = 10;
const PRECIO_GB_MES = 0.015;
const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const destinoAvisos = () => config.telegramChatPrivado || config.telegramChat || "";

async function avisar(texto) {
  const chat = destinoAvisos();
  if (!config.telegramToken || !chat) return false;
  try {
    await enviar(chat, texto);
    return true;
  } catch (e) {
    console.error("[vigilancia] no se pudo avisar por Telegram:", e.message);
    return false;
  }
}

/* ------------------------------------------------------------------ Supabase */
let estadoSupabase = { ok: true, fallos: 0, ultimoAviso: 0 };

export async function vigilarSupabase() {
  let problema = null;
  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/panel_config?select=key&limit=1`, {
      headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 402) problema = { restringido: true, texto: (await res.text().catch(() => "")).slice(0, 200) };
    else if (res.status >= 500 || res.status === 401 || res.status === 403) problema = { restringido: false, texto: `respuesta ${res.status}` };
  } catch (e) {
    problema = { restringido: false, texto: String(e.message).slice(0, 120) };
  }

  if (!problema) {
    if (!estadoSupabase.ok && estadoSupabase.avisado) await avisar("✅ <b>Supabase vuelve a responder.</b> El panel y el servidor ya funcionan con normalidad.");
    estadoSupabase = { ok: true, fallos: 0, ultimoAviso: 0 };
    return;
  }
  estadoSupabase.fallos++;
  estadoSupabase.ok = false;
  // Un 402 es seguro: se avisa ya. Otros fallos, tras 3 comprobaciones seguidas (15 min) para no molestar por un corte breve.
  if (!problema.restringido && estadoSupabase.fallos < 3) return;
  if (Date.now() - estadoSupabase.ultimoAviso < 6 * 3600000) return;
  const texto = problema.restringido
    ? "🚨 <b>Supabase ha restringido el proyecto</b> (te has pasado del cupo del plan gratuito). El panel, el portal de las modelos y el servidor NO pueden leer datos.\n👉 Entra en Supabase → Organization → Billing → Usage y mira la fecha de reinicio del cupo.\n💾 Tus datos están a salvo: copia nocturna en el servidor y en Cloudflare R2 (carpeta backups/db)."
    : `⚠️ <b>Supabase no responde</b> desde hace ${estadoSupabase.fallos * 5} minutos (${esc(problema.texto)}). Si dura, mira el estado en status.supabase.com.`;
  estadoSupabase.avisado = (await avisar(texto)) || estadoSupabase.avisado;
  estadoSupabase.ultimoAviso = Date.now();
}

/* ------------------------------------------------------------------ Cloudflare R2 */
let ultimoAvisoR2 = { at: 0, gb: 0 };

async function listarTodo(bucket) {
  const porCarpeta = new Map();
  let bytes = 0;
  let objetos = 0;
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const o of r.Contents ?? []) {
      const carpeta = (o.Key ?? "").split("/")[0] || "(raiz)";
      const c = porCarpeta.get(carpeta) ?? { bytes: 0, objetos: 0 };
      c.bytes += o.Size ?? 0;
      c.objetos++;
      porCarpeta.set(carpeta, c);
      bytes += o.Size ?? 0;
      objetos++;
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return { bytes, objetos, porCarpeta };
}

/** Cancela las subidas por partes abandonadas (hace mas de 36 h): sus trozos ocupan espacio facturable. */
async function limpiarSubidasAMedias(bucket) {
  let abiertas = 0;
  let canceladas = 0;
  let bytesPerdidos = 0;
  const limite = Date.now() - 36 * 3600000;
  let keyMarker;
  let uploadMarker;
  do {
    const r = await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket, KeyMarker: keyMarker, UploadIdMarker: uploadMarker }));
    for (const u of r.Uploads ?? []) {
      abiertas++;
      if (u.Initiated && u.Initiated.getTime() < limite && u.Key && u.UploadId) {
        await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId })).then(() => canceladas++, () => undefined);
      }
    }
    keyMarker = r.IsTruncated ? r.NextKeyMarker : undefined;
    uploadMarker = r.IsTruncated ? r.NextUploadIdMarker : undefined;
  } while (keyMarker || uploadMarker);
  return { abiertas, canceladas, bytesPerdidos };
}

let lifecycleIntentado = false;
/** Regla permanente en el bucket (si la clave de R2 tiene permiso de administrador): las subidas a medias se limpian solas a los 2 dias. */
async function asegurarLimpiezaAutomatica(bucket) {
  if (lifecycleIntentado) return;
  lifecycleIntentado = true;
  try {
    // Poner una regla REEMPLAZA las que hubiera: solo se pone si el bucket no tiene ninguna
    const existente = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket })).catch((e) => (/NoSuchLifecycle/i.test(`${e.name} ${e.message}`) ? null : Promise.reject(e)));
    if (existente?.Rules?.length) return;
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: { Rules: [{ ID: "limpiar-subidas-a-medias", Status: "Enabled", Filter: { Prefix: "" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 } }] },
      }),
    );
    console.log("[vigilancia] R2: regla de limpieza automatica de subidas a medias activada");
  } catch (e) {
    console.log(`[vigilancia] R2: no se pudo poner la regla automatica (${String(e.name ?? e.message).slice(0, 60)}); se limpia desde aqui cada 12 h`);
  }
}

export async function vigilarR2(supabase) {
  const buckets = [...new Set([config.r2Bucket, process.env.R2_BUCKET_ONLYFANS].filter(Boolean))];
  let bytes = 0;
  let objetos = 0;
  const carpetas = {};
  let multipart = { abiertas: 0, canceladas: 0 };
  for (const b of buckets) {
    try {
      await asegurarLimpiezaAutomatica(b);
      const t = await listarTodo(b);
      bytes += t.bytes;
      objetos += t.objetos;
      for (const [c, v] of t.porCarpeta) carpetas[c] = { bytes: (carpetas[c]?.bytes ?? 0) + v.bytes, objetos: (carpetas[c]?.objetos ?? 0) + v.objetos };
      const m = await limpiarSubidasAMedias(b);
      multipart = { abiertas: multipart.abiertas + m.abiertas, canceladas: multipart.canceladas + m.canceladas };
    } catch (e) {
      console.error(`[vigilancia] R2 ${b}:`, String(e.message).slice(0, 160));
      return;
    }
  }
  const gb = bytes / GB;
  const coste = Math.max(0, gb - GRATIS_GB) * PRECIO_GB_MES;
  const top = Object.entries(carpetas).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 8);
  await supabase
    .from("panel_config")
    .upsert({ key: "r2_uso", value: { at: new Date().toISOString(), gb: Math.round(gb * 100) / 100, objetos, coste_mes_usd: Math.round(coste * 100) / 100, carpetas: Object.fromEntries(top.map(([c, v]) => [c, { gb: Math.round((v.bytes / GB) * 100) / 100, objetos: v.objetos }])), subidas_a_medias: multipart }, updated_at: new Date().toISOString() })
    .then(() => undefined, () => undefined);
  console.log(`[vigilancia] R2: ${gb.toFixed(2)} GB en ${objetos} objetos (coste estimado ${coste.toFixed(2)} $/mes); subidas a medias: ${multipart.abiertas} (${multipart.canceladas} canceladas)`);

  // Aviso: al llegar al umbral, y despues cada vez que crece 2 GB mas o pasa una semana
  const toca = gb >= AVISO_GB && (gb >= ultimoAvisoR2.gb + 2 || Date.now() - ultimoAvisoR2.at > 7 * 86400000);
  if (toca) {
    const lista = top.slice(0, 4).map(([c, v]) => `• ${esc(c)}: ${(v.bytes / GB).toFixed(1)} GB`).join("\n");
    const texto =
      gb >= GRATIS_GB
        ? `💸 <b>Cloudflare R2 ya supera el tramo gratuito:</b> ${gb.toFixed(1)} GB (gratis hasta ${GRATIS_GB} GB). Coste estimado: <b>${coste.toFixed(2)} $/mes</b> (${PRECIO_GB_MES} $ por GB extra; las descargas no se cobran).\n${lista}\n👉 Si quieres frenar el gasto, borra originales viejos que ya no hagan falta.`
        : `📦 <b>Cloudflare R2 se acerca al tramo gratuito:</b> ${gb.toFixed(1)} GB de ${GRATIS_GB} GB gratis. Pasados los ${GRATIS_GB} GB se cobran ${PRECIO_GB_MES} $ por GB al mes.\n${lista}`;
    if (await avisar(texto)) ultimoAvisoR2 = { at: Date.now(), gb };
  }
}
