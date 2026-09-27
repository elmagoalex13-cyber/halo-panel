import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}

const yes = process.argv.includes("--yes");
const includeErrorsOnly = process.argv.includes("--errors-only");
const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
const estadosProceso = includeErrorsOnly ? ["error"] : ["pendiente", "procesando", "error"];

const query = supabase
  .from("library_content")
  .select("id, titulo, estado, estado_procesamiento, recibido_at")
  .eq("estado", "editando")
  .in("estado_procesamiento", estadosProceso)
  .or("tipo.is.null,tipo.neq.5")
  .order("recibido_at", { ascending: true });

const { data: piezas, error } = await query;
if (error) {
  console.error("No se pudo leer la cola:", error.message);
  process.exit(1);
}

console.log(`Piezas en cola encontradas: ${piezas?.length ?? 0}`);
for (const pieza of piezas ?? []) {
  console.log(`- ${pieza.id} [${pieza.estado_procesamiento ?? "sin_estado"}] ${pieza.titulo ?? ""}`.trim());
}

if (!piezas?.length) process.exit(0);

if (!yes) {
  console.log("\nNo se ha borrado nada. Repite con --yes para borrar estas filas.");
  process.exit(0);
}

const ids = piezas.map((pieza) => pieza.id);
const { error: deleteError } = await supabase
  .from("library_content")
  .delete()
  .in("id", ids);

if (deleteError) {
  console.error("No se pudo borrar la cola:", deleteError.message);
  process.exit(1);
}

console.log(`Borradas: ${ids.length}`);
