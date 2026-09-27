import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
const min = Math.max(0, Number(process.argv[2] ?? 0));
const limite = new Date(Date.now() - min * 60000).toISOString();

const { data: reencoladas, error: reencolarError } = await supabase
  .from("library_content")
  .update({ estado_procesamiento: "pendiente", error_mensaje: null, updated_at: new Date().toISOString() })
  .eq("estado", "editando")
  .eq("estado_procesamiento", "procesando")
  .lt("updated_at", limite)
  .select("id, titulo, updated_at");

if (reencolarError) {
  console.error("No se pudieron reencolar piezas atascadas:", reencolarError.message);
  process.exit(1);
}

const { data: sincronizadas, error: syncError } = await supabase
  .from("library_content")
  .update({ estado: "en_aprobacion", edicion_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  .eq("estado", "editando")
  .eq("estado_procesamiento", "listo")
  .select("id, titulo");

if (syncError) {
  console.error("No se pudieron mover listas a aprobacion:", syncError.message);
  process.exit(1);
}

console.log(`Reencoladas: ${reencoladas?.length ?? 0}`);
for (const row of reencoladas ?? []) console.log(`- ${row.id} ${row.titulo ?? ""}`.trim());
console.log(`Movidas a aprobacion: ${sincronizadas?.length ?? 0}`);
for (const row of sincronizadas ?? []) console.log(`- ${row.id} ${row.titulo ?? ""}`.trim());
