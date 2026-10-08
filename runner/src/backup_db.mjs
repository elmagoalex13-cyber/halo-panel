/**
 * Copia de seguridad NOCTURNA de la base de datos (el plan gratuito de Supabase no hace copias).
 * Vuelca las tablas a JSON comprimido y las guarda en DOS sitios distintos:
 *   - disco del VPS:           <BACKUP_DIR>/db/AAAA-MM-DD/<tabla>.json.gz   (se conservan 30 dias)
 *   - Supabase Storage privado: backups-privados/db/AAAA-MM-DD/<tabla>.json.gz (se conservan 14 dias)
 * Las contrasenas del Vault ya van cifradas en la propia base de datos; el bucket es privado.
 * Se ejecuta una vez al dia, a partir de las 03:00 UTC. Restaurar una tabla = leer su json.gz y hacer insert.
 */
import { mkdir, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { gzipSync } from "zlib";
import { config } from "./config.mjs";

const BUCKET = "backups-privados";
const TABLAS = [
  "modelos", "vault_panel", "panel_usuarios", "panel_config", "panel_actividad", "papelera_filas",
  "cuentas_instagram", "facturacion_modelos", "venuz_cuentas", "venuz_ingresos_diarios", "venuz_resumen_mensual",
  "library_content", "encargos", "referencias", "referencias_cuentas", "referencias_videos", "banco_frases_canciones",
  "of_colecciones", "of_archivos", "modelo_onboarding", "modelo_onboarding_historial", "creator_configs",
  "virales_propios", "asignaciones_modelo", "landings", "leads",
];
const DIAS_VPS = 30;
const DIAS_SUPABASE = 14;

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
  for (const tabla of TABLAS) {
    try {
      const filas = await volcarTabla(supabase, tabla);
      if (filas === null) continue;
      const gz = gzipSync(JSON.stringify(filas));
      await writeFile(path.join(dir, `${tabla}.json.gz`), gz);
      const { error } = await supabase.storage.from(BUCKET).upload(`db/${dia}/${tabla}.json.gz`, gz, { contentType: "application/gzip", upsert: true });
      if (error) console.error(`[backup] ${tabla}: no se pudo subir a Supabase Storage: ${error.message}`);
      resumen.push(`${tabla}:${filas.length}`);
    } catch (e) {
      fallos++;
      console.error(`[backup] ${e.message}`);
    }
  }
  if (!fallos) {
    ultimoDia = dia;
    await supabase.from("panel_config").upsert({ key: "backup_db", value: { at: new Date().toISOString(), dia, tablas: resumen.length }, updated_at: new Date().toISOString() }).then(() => undefined, () => undefined);
  }
  console.log(`[backup] ${dia}: ${resumen.length} tablas${fallos ? `, ${fallos} con fallo (se reintenta)` : ""} -> ${dir}`);

  // Limpieza de copias viejas
  try {
    const limiteVps = Date.now() - DIAS_VPS * 86400000;
    for (const d of await readdir(path.join(config.backupDir, "db"))) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Date.parse(d) < limiteVps) await rm(path.join(config.backupDir, "db", d), { recursive: true, force: true });
    }
    const { data: carpetas } = await supabase.storage.from(BUCKET).list("db", { limit: 200 });
    const limiteSb = Date.now() - DIAS_SUPABASE * 86400000;
    for (const c of carpetas ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.name) || Date.parse(c.name) >= limiteSb) continue;
      const { data: archivos } = await supabase.storage.from(BUCKET).list(`db/${c.name}`, { limit: 100 });
      if (archivos?.length) await supabase.storage.from(BUCKET).remove(archivos.map((a) => `db/${c.name}/${a.name}`));
    }
  } catch (e) {
    console.error("[backup] limpieza:", e.message);
  }
}
