// Prueba controlada de Venuz (cola de posts) con UNA cuenta: sube una imagen neutra de prueba, programa un post muy lejano y lo borra.
// Uso (en el VPS):  node src/venuz_prueba.mjs <paso> [args]
//   cuentas | subir | buscar <nombreArchivo> | post <ofMediaId> <fechaISO> | ver <YYYY-MM-DD> | borrar <postId>
// Todo lo que se imprime tiene las claves/tokens tapados.
import { execFileSync } from "child_process";
import { readFileSync, rmSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.mjs";
import { SesionVenuz } from "./venuz.mjs";

const sb = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
const tapar = (v, k = "") => {
  if (/token|secret|password|cookie|authorization|signature|sig\b/i.test(k)) return "***";
  if (Array.isArray(v)) return v.slice(0, 5).map((x) => tapar(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).slice(0, 40).map(([a, b]) => [a, tapar(b, a)]));
  if (typeof v === "string" && v.length > 140) return v.slice(0, 140) + "…";
  return v;
};
const mostrar = (titulo, r) => console.log(`\n=== ${titulo} -> HTTP ${r.status}\n${JSON.stringify(tapar(r.cuerpo), null, 1).slice(0, 2500)}`);

const [, , paso, ...args] = process.argv;
const { data: cuentas } = await sb.from("venuz_cuentas").select("id, nombre").ilike("nombre", "%rachel%");
if (cuentas?.length !== 1) throw new Error(`Se esperaba 1 cuenta de Rachel y hay ${cuentas?.length}`);
const cuenta = cuentas[0];
const sesion = new SesionVenuz(config.venuzEmail, config.venuzPassword);

if (paso === "cuentas") {
  console.log("cuenta de prueba:", cuenta.nombre);
  mostrar("GET /api/accounts/:id", await sesion.enviar("GET", `/api/accounts/${cuenta.id}`));
} else if (paso === "subir") {
  const nombre = `halo-prueba-${Date.now()}.jpg`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x8B5CF6:s=720x720", "-frames:v", "1", "/tmp/halo-prueba.jpg"]);
  const bytes = readFileSync("/tmp/halo-prueba.jpg");
  const ini = await sesion.enviar("POST", "/api/messages/upload-init", { json: { account_id: cuenta.id, mime_type: "image/jpeg", size_bytes: bytes.length, original_name: nombre } });
  mostrar("upload-init", ini);
  const u = ini.cuerpo;
  if (ini.status >= 300 || !u?.upload_url) throw new Error("upload-init no dio upload_url");
  const form = new FormData();
  form.append("file", new File([bytes], nombre, { type: "image/jpeg" }));
  const subida = await sesion.enviar("POST", "", { form, bearer: u.upload_token, url: /^https?:/.test(u.upload_url) ? u.upload_url : `https://crm-api-next.venuz.ai${u.upload_url}` });
  mostrar("subida del archivo", subida);
  console.log("\nNOMBRE_ARCHIVO=" + nombre);
  rmSync("/tmp/halo-prueba.jpg", { force: true });
} else if (paso === "buscar") {
  const q = new URLSearchParams({ account_id: cuenta.id, offset: "0", limit: "10", field: "created_at", sort: "desc", file_type: "photo" });
  const r = await sesion.enviar("GET", `/api/vault/of-vault/browse?${q}`);
  mostrar("vault (10 ultimas fotos)", r);
} else if (paso === "post") {
  const [ofMediaId, fecha] = args;
  const body = { account_id: cuenta.id, text: "[PRUEBA - NO PUBLICAR] borrar", media_files: [Number(ofMediaId)], scheduled_date: fecha, rf_tag: [], rf_guest: [], rf_partner: [] };
  mostrar("POST /api/queue/posts", await sesion.enviar("POST", "/api/queue/posts", { json: body }));
} else if (paso === "ver") {
  const q = new URLSearchParams({ account_id: cuenta.id, publish_date: args[0], timezone: "Europe/Madrid" });
  mostrar("GET /api/queue/schedules", await sesion.enviar("GET", `/api/queue/schedules?${q}`));
} else if (paso === "borrar") {
  mostrar("DELETE /api/queue/posts", await sesion.enviar("DELETE", `/api/queue/posts/${args[0]}?account_id=${cuenta.id}`));
} else {
  console.log("paso desconocido");
}
