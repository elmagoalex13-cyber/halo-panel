const $ = (id) => document.getElementById(id);
const POR_DEFECTO = "https://halo-panel.vercel.app";

function pintar(estado) {
  const e = estado ?? { corriendo: false, log: [], cuentas: [] };
  $("analizar").disabled = e.corriendo;
  $("analizar").textContent = e.corriendo ? "Analizando…" : "Analizar";
  $("cancelar").hidden = !e.corriendo;

  $("cuentas").replaceChildren(
    ...(e.cuentas ?? []).map((c) => {
      const li = document.createElement("li");
      li.className = c.estado === "hecho" ? "hecho" : c.estado === "error" ? "error" : "";
      const nombre = document.createElement("span");
      nombre.textContent = `@${c.username}`;
      const detalle = document.createElement("span");
      detalle.textContent = c.estado === "hecho" ? `${c.nuevos ?? 0} nuevo(s)` : c.estado === "error" ? "error" : c.estado;
      li.append(nombre, detalle);
      return li;
    }),
  );

  const log = $("log");
  log.replaceChildren(
    ...(e.log ?? []).slice(-12).map((l) => {
      const d = document.createElement("div");
      d.className = l.nivel;
      d.textContent = l.texto;
      return d;
    }),
  );
  log.scrollTop = log.scrollHeight;
}

function actualizarFilas() {
  $("fila-categoria").hidden = $("modo").value !== "referencias";
}

async function init() {
  const { ajustes } = await chrome.storage.local.get("ajustes");
  $("panelUrl").value = ajustes?.panelUrl ?? POR_DEFECTO;
  $("abrirPanel").href = `${$("panelUrl").value}/instagram?tab=ideas`;
  const guardado = await chrome.storage.local.get("ultimo");
  if (guardado.ultimo) {
    $("modo").value = guardado.ultimo.modo;
    $("categoria").value = guardado.ultimo.categoria;
    $("dias").value = guardado.ultimo.dias;
  }
  actualizarFilas();
  chrome.runtime.sendMessage({ type: "status" }, (r) => pintar(r?.estado));
}

$("modo").addEventListener("change", actualizarFilas);
$("analizar").addEventListener("click", async () => {
  const datos = { modo: $("modo").value, categoria: $("categoria").value, dias: Number($("dias").value) };
  await chrome.storage.local.set({ ultimo: datos });
  chrome.runtime.sendMessage({ type: "scan", ...datos });
});
$("cancelar").addEventListener("click", () => chrome.runtime.sendMessage({ type: "cancel" }));
$("guardar").addEventListener("click", async () => {
  const panelUrl = $("panelUrl").value.trim().replace(/\/+$/, "") || POR_DEFECTO;
  await chrome.storage.local.set({ ajustes: { panelUrl } });
  $("abrirPanel").href = `${panelUrl}/instagram?tab=ideas`;
  $("guardar").textContent = "Guardado ✓";
  setTimeout(() => ($("guardar").textContent = "Guardar"), 1500);
});

chrome.storage.onChanged.addListener((cambios) => {
  if (cambios.estado) pintar(cambios.estado.newValue);
});

init();
