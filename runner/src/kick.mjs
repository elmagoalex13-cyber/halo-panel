import { config, faltanVariables } from "./config.mjs";
import { cicloOnce } from "./queue.mjs";

const falta = faltanVariables();
if (falta.length) {
  console.error("Faltan variables en .env:", falta.join(", "));
  process.exit(1);
}

console.log(`Kick de cola: max ${config.maxPiezas}, concurrencia ${config.runnerConcurrency}`);
const result = await cicloOnce({ logEmpty: true });
const ok = result.results.filter((row) => row?.ok).length;
const fail = result.results.filter((row) => row && !row.ok).length;
console.log(`Kick terminado. Reclamadas: ${result.claimed}. OK: ${ok}. Error: ${fail}.`);
if (fail > 0) process.exit(1);
