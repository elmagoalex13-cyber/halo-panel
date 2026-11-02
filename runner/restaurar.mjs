/**
 * Restaura una copia de seguridad de la base de datos en un proyecto de Supabase (nuevo o el mismo).
 * Antes hay que crear las tablas con supabase/esquema_actual.sql (ver RESPALDOS.md).
 *
 *   node restaurar.mjs <carpeta-con-los-.json.gz>      ej.: node restaurar.mjs C:\Users\tu\Desktop\COPIA-DATOS-HALO\db\2026-11-01
 *   node restaurar.mjs 2026-11-01                      lee la copia de Cloudflare R2 (backups/db/2026-11-01/)
 *
 * Necesita las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del proyecto DESTINO (y las de R2 si lee de R2).
 * Es seguro repetirlo: las filas que ya existen se actualizan, no se duplican.
 */
import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "zlib";
import { readdir, readFile } from "fs/promises";
import path from "path";

const origen = process.argv[2];
if (!origen) {
  console.error("Uso: node restaurar.mjs <carpeta | AAAA-MM-DD>");
  process.exit(1);
}
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (las del proyecto destino).");
  process.exit(1);
}
const sb = createClient(url, clave, { auth: { persistSession: false } });

async function leerCopias() {
  const copias = new Map();
  if (/^\d{4}-\d{2}-\d{2}$/.test(origen)) {
    const { listarClaves, s3 } = await import("./src/r2.mjs");
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { config } = await import("./src/config.mjs");
    for (const k of await listarClaves(`backups/db/${origen}/`)) {
      if (!k.endsWith(".json.gz")) continue;
      const { Body } = await s3.send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: k }));
      copias.set(path.basename(k, ".json.gz"), JSON.parse(gunzipSync(Buffer.from(await Body.transformToByteArray())).toString("utf8")));
    }
  } else {
    for (const f of await readdir(origen)) {
      if (f.endsWith(".json.gz")) copias.set(f.replace(/\.json\.gz$/, ""), JSON.parse(gunzipSync(await readFile(path.join(origen, f))).toString("utf8")));
    }
  }
  return copias;
}

const copias = await leerCopias();
console.log(`Copia leida: ${copias.size} tablas, ${[...copias.values()].reduce((s, r) => s + r.length, 0)} filas`);

const omitir = new Map(); // columnas generadas por tabla (no se pueden escribir)
let pendientes = [...copias.keys()].filter((t) => copias.get(t).length);
const hechas = new Map();
for (let pasada = 1; pasada <= 8 && pendientes.length; pasada++) {
  const siguiente = [];
  for (const tabla of pendientes) {
    const filas = copias.get(tabla);
    let total = 0;
    let problema = null;
    for (let i = 0; i < filas.length && !problema; i += 300) {
      let lote = filas.slice(i, i + 300);
      for (let intento = 0; intento < 4; intento++) {
        const quitar = omitir.get(tabla);
        if (quitar?.size) lote = lote.map((r) => Object.fromEntries(Object.entries(r).filter(([c]) => !quitar.has(c))));
        const { error } = await sb.from(tabla).upsert(lote);
        if (!error) {
          total += lote.length;
          problema = null;
          break;
        }
        const col = /column "([^"]+)"/.exec(error.message)?.[1];
        if (col && /generated|non-DEFAULT/i.test(error.message)) {
          omitir.set(tabla, (omitir.get(tabla) ?? new Set()).add(col)); // columna calculada: se reintenta sin ella
          continue;
        }
        problema = error;
        break;
      }
    }
    if (problema) {
      if (/relation .* does not exist|schema cache/i.test(problema.message)) console.log(`  ${tabla}: no existe en el destino (puede ser una vista); se salta`);
      else siguiente.push(tabla); // normalmente depende de otra tabla (clave foranea): se reintenta en la siguiente pasada
      if (pasada === 8 || !/violates foreign key/i.test(problema.message)) console.log(`  ${tabla}: ${problema.message.slice(0, 140)}`);
    } else {
      hechas.set(tabla, total);
      console.log(`  ${tabla}: ${total} filas`);
    }
  }
  pendientes = siguiente;
}
console.log(pendientes.length ? `\nQuedaron sin restaurar: ${pendientes.join(", ")}` : `\nRestauradas ${hechas.size} tablas.`);
process.exit(pendientes.length ? 2 : 0);
