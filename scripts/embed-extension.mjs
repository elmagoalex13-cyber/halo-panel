// Mete los archivos de la extension de Chrome (carpeta extension/) dentro del panel para que el boton "Actualizar extension"
// pueda dejarselos a quien la tenga instalada, sin volver a descargar ni descomprimir nada.
// Se ejecuta solo antes de cada build (prebuild) y genera src/lib/extensionArchivos.generated.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVOS = ["manifest.json", "background.js", "content-panel.js", "ig-hook.js", "popup.html", "popup.css", "popup.js"];

const contenido = Object.fromEntries(ARCHIVOS.map((n) => [n, readFileSync(join(raiz, "extension", n), "utf8")]));
const version = JSON.parse(contenido["manifest.json"]).version;

const salida = `// GENERADO por scripts/embed-extension.mjs (no editar a mano): copia de la carpeta extension/.
export const EXTENSION_VERSION = ${JSON.stringify(version)};
export const EXTENSION_ARCHIVOS: Record<string, string> = ${JSON.stringify(contenido, null, 1)};
`;
writeFileSync(join(raiz, "src", "lib", "extensionArchivos.generated.ts"), salida);
console.log(`[embed-extension] v${version}: ${ARCHIVOS.length} archivos`);
