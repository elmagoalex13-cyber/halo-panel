/** node src/diagnostico.mjs  -> comprueba ffmpeg, whisper, Supabase, R2 y la cola. */
import { execFile } from "child_process";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";
import { resolverWhisper } from "./whisper.mjs";
import { existeEnR2 } from "./r2.mjs";

const run = promisify(execFile);
const ok = (m) => console.log("OK   ", m);
const ko = (m) => console.log("FALLO", m);

const falta = faltanVariables();
falta.length ? ko(`variables .env que faltan: ${falta.join(", ")}`) : ok("variables .env completas");
console.log(`     intervalo de cola: ${config.pollMs / 1000}s (POLL_INTERVAL_MS)`);

for (const [nombre, bin] of [["ffmpeg", config.ffmpeg], ["ffprobe", config.ffprobe]]) {
  try {
    const { stdout } = await run(bin, ["-version"]);
    ok(`${nombre}: ${stdout.split("\n")[0]}`);
  } catch {
    ko(`${nombre} no esta instalado (apt install -y ffmpeg)`);
  }
}
const w = await resolverWhisper();
w ? ok(`whisper: ${w.bin} con modelo ${w.model}`) : ko("whisper no encontrado: los tipos 1/3/4 saldran SIN subtitulos");

const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from("library_content")
  .select("id, estado, estado_procesamiento, tipo, r2_key")
  .eq("estado", "editando");
if (error) ko(`Supabase: ${error.message}`);
else {
  ok(`Supabase conectado. Piezas en 'editando': ${data.length}`);
  for (const p of data) {
    const existe = p.r2_key ? await existeEnR2(p.r2_key) : false;
    console.log(`     - ${p.id} tipo=${p.tipo} proc=${p.estado_procesamiento} bruto_en_R2=${existe}`);
  }
}
