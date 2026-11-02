/**
 * Copia de seguridad NOCTURNA de TODA la base de datos (el plan gratuito de Supabase no hace copias).
 * Vuelca todas las tablas de «public» (la lista se lee de la propia base, asi una tabla nueva entra sola) a JSON comprimido y lo guarda en DOS sitios
 * que NO dependen de Supabase (si Supabase se bloquea, las copias siguen accesibles):
 *   - disco del servidor:  <BACKUP_DIR>/db/AAAA-MM-DD/<tabla>.json.gz   (se conservan 30 dias)
 *   - Cloudflare R2:       backups/db/AAAA-MM-DD/<tabla>.json.gz        (se conservan 30 dias; ocupa ~2 MB por dia)
 * Las contrasenas del Vault ya van cifradas en la propia base de datos. Para restaurar: runner/restaurar.mjs (ver RESPALDOS.md).
 * Se ejecuta una vez al dia, a partir de las 03:00 UTC.
 */
import { mkdir, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { gzipSync } from "zlib";
import { config } from "./config.mjs";
import { borrarDeR2, listarClaves, subirBufferAR2 } from "./r2.mjs";

const PREFIJO_R2 = "backups/db/";
// Lista de reserva por si no se puede leer la de la base de datos
const TABLAS_RESERVA = [
  "modelos", "vault_panel", "panel_usuarios", "panel_config", "panel_actividad", "papelera_filas",
  "cuentas_instagram", "facturacion_modelos", "venuz_cuentas", "venuz_ingresos_diarios", "venuz_resumen_mensual",
  "library_content", "encargos", "referencias", "referencias_cuentas", "referencias_videos", "banco_frases_canciones",
  "of_colecciones", "of_archivos", "modelo_onboarding", "modelo_onboarding_historial", "creator_configs",
  "virales_propios", "asignaciones_modelo", "landings", "leads", "contratos_modelos",
];
const DIAS_VPS = 30;
const DIAS_R2 = 30;

/** Todas las tablas de «public» (PostgREST las publica en su raiz); si falla, la lista de reserva. */
async function listarTablas() {
  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/`, { headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const nombres = Object.keys(j.paths ?? {}).filter((p) => /^\/[a-z0-9_]+$/i.test(p)).map((p) => p.slice(1));
    if (nombres.length > 10) return nombres;
  } catch (e) {
    console.error("[backup] no se pudo leer la lista de tablas, se usa la de reserva:", e.message);
  }
  return TABLAS_RESERVA;
}

const hoy = () => new Date().toISOString().slice(0, 10);
let ultimoDia = null;

async function volcarTabla(supabase, tabla) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select("*").range(desde, desde + 999);
    if (error) {
      if (/does not exist|relation|schema cache/i.test(error.message)) return null; // la tabla no existe en este proyecto
      throw new Error(`${tabla}: ${error.message}`);
    }
    filas.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return filas;
}

export async function backupDb(supabase, { forzar = false } = {}) {
  const dia = hoy();
  if (!forzar && (ultimoDia === dia || new Date().getUTCHours() < 3)) return;
  const dir = path.join(config.backupDir, "db", dia);
  await mkdir(dir, { recursive: true });

  const resumen = [];
  let fallos = 0;
  let enR2 = 0;
  const TABLAS = await listarTablas();
  for (const tabla of TABLAS) {
    try {
      const filas = await volcarTabla(supabase, tabla);
      if (filas === null) continue;
      const gz = gzipSync(JSON.stringify(filas));
      await writeFile(path.join(dir, `${tabla}.json.gz`), gz);
      await subirBufferAR2(`${PREFIJO_R2}${dia}/${tabla}.json.gz`, gz, "application/gzip").then(
        () => enR2++,
        (e) => console.error(`[backup] ${tabla}: no se pudo subir a Cloudflare R2: ${e.message}`),
      );
      resumen.push(`${tabla}:${filas.length}`);
    } catch (e) {
      fallos++;
      console.error(`[backup] ${e.message}`);
    }
  }
  // Estructura de la base (tablas, claves, funciones...) junto a los datos: con ambas se reconstruye todo en un proyecto nuevo
  try {
    const { data: esquema, error } = await supabase.rpc("halo_esquema");
    if (error) throw new Error(error.message);
    const buf = Buffer.from(String(esquema), "utf8");
    await writeFile(path.join(dir, "_esquema.sql"), buf);
    await subirBufferAR2(`${PREFIJO_R2}${dia}/_esquema.sql`, buf, "text/plain; charset=utf-8");
  } catch (e) {
    console.error(`[backup] esquema: ${e.message}`);
  }
  if (!fallos) {
    ultimoDia = dia;
    await supabase.from("panel_config").upsert({ key: "backup_db", value: { at: new Date().toISOString(), dia, tablas: resumen.length, en_r2: enR2, filas: resumen.reduce((s, x) => s + Number(x.split(":")[1] || 0), 0) }, updated_at: new Date().toISOString() }).then(() => undefined, () => undefined);
  }
  console.log(`[backup] ${dia}: ${resumen.length} tablas${fallos ? `, ${fallos} con fallo (se reintenta)` : ""} -> ${dir}`);

  // Limpieza de copias viejas
  try {
    const limiteVps = Date.now() - DIAS_VPS * 86400000;
    for (const d of await readdir(path.join(config.backupDir, "db"))) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Date.parse(d) < limiteVps) await rm(path.join(config.backupDir, "db", d), { recursive: true, force: true });
    }
    const limiteR2 = Date.now() - DIAS_R2 * 86400000;
    for (const k of await listarClaves(PREFIJO_R2)) {
      const d = k.slice(PREFIJO_R2.length).split("/")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Date.parse(d) < limiteR2) await borrarDeR2(k).catch(() => undefined);
    }
  } catch (e) {
    console.error("[backup] limpieza:", e.message);
  }
}
