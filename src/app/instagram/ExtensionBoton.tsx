"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type EstadoExt = {
  corriendo: boolean;
  log?: Array<{ nivel: string; texto: string }>;
  cuentas?: Array<{ username: string; estado: string; nuevos?: number }>;
  resumen?: { nuevos: number; errores: number; cuentas: number } | null;
};

const CATEGORIAS = [
  { value: "todas", label: "Todos los tipos" },
  { value: "frases", label: "Frases + música" },
  { value: "hablado", label: "Contenido hablado" },
  { value: "referencia", label: "Referencia visual" },
  { value: "general", label: "General" },
];

// Version minima de la extension que entiende el panel (lee todos los reels paginando, cuentas elegidas...).
const VERSION_MINIMA = "1.6.0";
const VERSION_CON_RECARGA = "1.7.0"; // desde esta version la extension se recarga sola al actualizarla desde el panel // 1.6.0: las cuentas de referencia se reparten entre quienes analizan a la vez + ronda automatica del lunes
const comparar = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

type CuentaLista = { id: string; username: string; categoria: string | null; etiqueta: string };

// Minimo de la API "File System Access" de Chrome que se usa para dejar los archivos nuevos en la carpeta de la extension
type CarpetaChrome = {
  getFileHandle: (nombre: string, opciones?: { create?: boolean }) => Promise<{ getFile: () => Promise<{ text: () => Promise<string> }>; createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>;
};

// Boton que lanza la extension de Chrome "HALO Virales" desde el propio panel (la extension tiene
// que estar instalada en este Chrome). Habla con ella por window.postMessage.
export function ExtensionBoton({
  modo,
  ids,
  onIdsChange,
}: {
  modo: "referencias" | "propias";
  ids?: string[]; // seleccion controlada desde fuera (opcional)
  onIdsChange?: (ids: string[]) => void;
}) {
  const router = useRouter();
  const [detectada, setDetectada] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoExt | null>(null);
  const [categoria, setCategoria] = useState("todas");
  const [version, setVersion] = useState<string | null>(null);
  const antes = useRef(false);
  const [ultima, setUltima] = useState<string | null>(null); // ultima version de la extension que ofrece el panel
  const [actualizando, setActualizando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/extension/archivos?solo=version")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string } | null) => vivo && setUltima(j?.version ?? null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // Deja los archivos de la ultima version en la carpeta de la extension (el navegador pide elegirla una vez) y la recarga.
  async function actualizarExtension() {
    setAviso(null);
    const selector = (window as unknown as { showDirectoryPicker?: (o: { mode: "readwrite" }) => Promise<CarpetaChrome> }).showDirectoryPicker;
    if (!selector) return setAviso({ ok: false, texto: "Este navegador no permite actualizarla desde aquí: usa Chrome o sustituye los archivos de la carpeta a mano." });
    setActualizando(true);
    try {
      const carpeta = await selector.call(window, { mode: "readwrite" });
      try {
        const manifiesto = JSON.parse(await (await (await carpeta.getFileHandle("manifest.json")).getFile()).text()) as { name?: string };
        if (manifiesto.name !== "HALO Virales") throw new Error("otra");
      } catch {
        throw new Error("Esa no es la carpeta de la extensión «HALO Virales» (es la que tiene dentro manifest.json y background.js). Elige esa carpeta.");
      }
      const res = await fetch("/api/extension/archivos");
      const j = (await res.json().catch(() => ({}))) as { version?: string; archivos?: Record<string, string>; error?: string };
      if (!res.ok || !j.archivos) throw new Error(j.error ?? "No se pudieron descargar los archivos nuevos");
      for (const [nombre, contenido] of Object.entries(j.archivos)) {
        const escritor = await (await carpeta.getFileHandle(nombre, { create: true })).createWritable();
        await escritor.write(contenido);
        await escritor.close();
      }
      if (version && comparar(version, VERSION_CON_RECARGA) >= 0) {
        setAviso({ ok: true, texto: `Extensión actualizada a la ${j.version}. Se recarga sola; la página se refresca en un momento.` });
        window.postMessage({ source: "halo-panel", type: "reload" }, window.location.origin);
        setTimeout(() => window.location.reload(), 2500);
      } else {
        setAviso({ ok: true, texto: `Archivos de la ${j.version} guardados. Falta un paso (solo esta vez): en chrome://extensions pulsa el icono de recargar ⟳ en «HALO Virales» y vuelve a abrir esta página. Desde la próxima, se recarga sola.` });
      }
    } catch (e) {
      const cancelado = e instanceof DOMException && e.name === "AbortError";
      if (!cancelado) setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo actualizar" });
    } finally {
      setActualizando(false);
    }
  }

  // Selector de cuentas: se puede analizar todas, una, tres, diez... las que se elijan.
  const [lista, setLista] = useState<CuentaLista[]>([]);
  const [propias, setPropias] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const elegidasBrutas = ids ?? propias;
  const cambiarElegidas = (siguiente: string[]) => (onIdsChange ? onIdsChange(siguiente) : setPropias(siguiente));

  useEffect(() => {
    let vivo = true;
    fetch(`/api/extension/cuentas?modo=${modo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cuentas?: CuentaLista[] } | null) => vivo && setLista(j?.cuentas ?? []))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [modo]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  useEffect(() => {
    function onMsg(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "halo-ext") return;
      const d = event.data as { type: string; estado?: EstadoExt; version?: string };
      if (d.type === "pong" || d.type === "ready") setDetectada(true);
      if (d.type === "pong" && d.version) setVersion(d.version);
      if ((d.type === "pong" || d.type === "estado") && d.estado) setEstado(d.estado);
    }
    window.addEventListener("message", onMsg);
    const ping = () => window.postMessage({ source: "halo-panel", type: "ping" }, window.location.origin);
    ping();
    const t = setTimeout(() => setDetectada((v) => (v === null ? false : v)), 1500);
    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(t);
    };
  }, []);

  // Al terminar un analisis, recargar los datos de la pagina para que aparezcan los videos nuevos.
  useEffect(() => {
    if (antes.current && estado && !estado.corriendo) router.refresh();
    antes.current = Boolean(estado?.corriendo);
  }, [estado, router]);

  const corriendo = Boolean(estado?.corriendo);
  const hechas = estado?.cuentas?.filter((c) => c.estado === "hecho" || c.estado === "error").length ?? 0;
  const total = estado?.cuentas?.length ?? 0;
  const ultimo = estado?.log?.[estado.log.length - 1];

  // Solo cuentas que existen todavia; si no hay ninguna elegida se analizan todas (las del tipo elegido).
  const elegidas = elegidasBrutas.filter((id) => lista.some((c) => c.id === id));
  const nElegidas = elegidas.length;
  const delTipo = modo === "referencias" && categoria !== "todas" ? lista.filter((c) => c.categoria === categoria) : lista;
  const q = busca.trim().toLowerCase();
  const filtradas = delTipo.filter((c) => !q || c.username.toLowerCase().includes(q) || c.etiqueta.toLowerCase().includes(q));
  const alternar = (id: string) => cambiarElegidas(elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id]);

  function lanzar() {
    window.postMessage(
      { source: "halo-panel", type: "scan", modo, categoria: modo === "referencias" && !nElegidas ? categoria : null, ids: nElegidas ? elegidas : undefined },
      window.location.origin,
    );
  }

  const desactualizada = version !== null && comparar(version, VERSION_MINIMA) < 0;
  const hayNueva = version !== null && ultima !== null && comparar(version, ultima) < 0;

  if (detectada === false) {
    return (
      <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
        No detecto la extensión «HALO Virales» en este Chrome. Instálala desde la carpeta <code>extension</code> del proyecto (chrome://extensions → Modo desarrollador → Cargar descomprimida) y recarga esta página.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {hayNueva || aviso ? (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-xs ${aviso && !aviso.ok ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-[#8B5CF6]/30 bg-[#8B5CF6]/10 text-[#ddd6fe]"}`}>
          <span className="min-w-0 flex-1">
            {aviso ? aviso.texto : `Hay una versión nueva de la extensión (${ultima}; tú tienes la ${version}).`}
          </span>
          {hayNueva ? (
            <button onClick={actualizarExtension} disabled={actualizando} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
              {actualizando ? "Actualizando…" : "Actualizar extensión"}
            </button>
          ) : null}
        </div>
      ) : null}
      {desactualizada ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Tu extensión es la versión {version} y hace falta la {VERSION_MINIMA} o superior: en <code>chrome://extensions</code> pulsa el icono de recargar en «HALO Virales», recarga las pestañas de Instagram y esta página.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {modo === "referencias" && !nElegidas ? (
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={corriendo} className="input-base py-1.5 text-xs">
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        ) : null}
        <div ref={caja} className="relative">
          <button
            onClick={() => setAbierto((v) => !v)}
            disabled={corriendo || !lista.length}
            className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
            title="Elige qué cuentas analizar"
          >
            {nElegidas ? `${nElegidas} de ${lista.length} cuentas` : `Todas las cuentas (${delTipo.length})`}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {abierto ? (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-white/[0.12] bg-[#12121a] p-2 shadow-2xl">
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cuenta…" className="input-base mb-2 w-full py-1.5 text-xs" autoFocus />
              <div className="mb-2 flex flex-wrap items-center gap-3 px-1 text-[11px]">
                <button onClick={() => cambiarElegidas(Array.from(new Set([...elegidas, ...filtradas.map((c) => c.id)])))} className="text-[#A78BFA] hover:underline">
                  Elegir las {filtradas.length} que se ven
                </button>
                <button onClick={() => cambiarElegidas([])} className="text-white/50 hover:text-white hover:underline">
                  Ninguna (= todas)
                </button>
              </div>
              <ul className="max-h-64 overflow-auto">
                {filtradas.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]">
                      <input type="checkbox" checked={elegidas.includes(c.id)} onChange={() => alternar(c.id)} className="h-4 w-4 accent-[#8B5CF6]" />
                      <span className="flex-1 truncate">@{c.username}</span>
                      {c.etiqueta ? <span className="text-[10px] text-white/35">{c.etiqueta}</span> : null}
                    </label>
                  </li>
                ))}
                {!filtradas.length ? <li className="px-2 py-3 text-center text-xs text-white/35">Ninguna cuenta con ese filtro.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
        <button
          onClick={lanzar}
          disabled={detectada !== true || corriendo || desactualizada}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {corriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          {corriendo ? `Analizando ${hechas}/${total}…` : nElegidas ? `Buscar virales en ${nElegidas} cuenta${nElegidas === 1 ? "" : "s"}` : modo === "referencias" ? "Buscar virales en todas" : "Buscar virales de mis modelos"}
        </button>
        <button
          onClick={() => window.postMessage({ source: "halo-panel", type: "refresh", modo }, window.location.origin)}
          disabled={detectada !== true || corriendo || desactualizada}
          title="Vuelve a leer visitas, likes, comentarios y compartidos de los vídeos ya guardados (sin descargarlos otra vez)"
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Actualizar métricas
        </button>
        {corriendo ? (
          <button onClick={() => window.postMessage({ source: "halo-panel", type: "cancel" }, window.location.origin)} className="btn-secondary px-3 py-1.5 text-xs">
            Cancelar
          </button>
        ) : null}
      </div>
      {ultimo ? (
        <p className={`text-xs ${ultimo.nivel === "error" ? "text-red-300" : ultimo.nivel === "ok" ? "text-emerald-300" : "text-white/50"}`}>{ultimo.texto}</p>
      ) : null}
    </div>
  );
}
