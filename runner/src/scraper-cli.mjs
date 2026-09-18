/** Lanza el scraper una vez, ahora, sin esperar a las 24h:  node src/scraper-cli.mjs */
import { createClient } from "@supabase/supabase-js";
import { config, faltanVariables } from "./config.mjs";
import { cicloScraper } from "./scraper.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}
if (!config.igSessionId) console.warn("Aviso: sin IG_SESSIONID Instagram suele responder 429. Ponla en el .env (cookie sessionid de una cuenta dedicada).");
const supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
await cicloScraper(supabase, { forzar: true });
console.log("Listo. Revisa Instagram > Ideas virales en el panel.");
