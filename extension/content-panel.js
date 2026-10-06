// Puente entre el panel HALO (la pagina) y la extension. El panel pinta un boton "Analizar con la
// extension" y le habla con window.postMessage; asi tambien se puede lanzar desde la propia web
// (por ejemplo, Claude pulsando el boton).
const ORIGEN_PANEL = "halo-panel";
const ORIGEN_EXT = "halo-ext";

function responder(mensaje) {
  window.postMessage({ source: ORIGEN_EXT, ...mensaje }, window.location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== ORIGEN_PANEL) return;
  const { type } = event.data;
  if (type === "ping" || type === "status") {
    chrome.runtime.sendMessage({ type: "status" }, (r) => {
      if (chrome.runtime.lastError) return;
      responder({ type: "pong", version: r?.version, estado: r?.estado });
    });
  } else if (type === "scan") {
    chrome.runtime.sendMessage({ type: "scan", modo: event.data.modo, categoria: event.data.categoria, dias: event.data.dias, ids: event.data.ids }, () => void chrome.runtime.lastError);
  } else if (type === "refresh") {
    chrome.runtime.sendMessage({ type: "refresh", modo: event.data.modo }, () => void chrome.runtime.lastError);
  } else if (type === "cancel") {
    chrome.runtime.sendMessage({ type: "cancel" }, () => void chrome.runtime.lastError);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "estado") responder({ type: "estado", estado: msg.estado });
});

responder({ type: "ready" });
