"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
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
const VERSION_MINIMA = "1.4.0";
const comparar = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

// Boton que lanza la extension de Chrome "HALO Virales" desde el propio panel (la extension tiene
// que estar instalada en este Chrome). Habla con ella por window.postMessage.
export function ExtensionBoton({ modo, ids }: { modo: "referencias" | "propias"; ids?: string[] }) {
  const router = useRouter();
  const [detectada, setDetectada] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoExt | null>(null);
  const [categoria, setCategoria] = useState("todas");
  const [version, setVersion] = useState<string | null>(null);
  const antes = useRef(false);

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

  function lanzar() {
    const elegidas = modo === "referencias" && ids?.length ? ids : undefined;
    window.postMessage({ source: "halo-panel", type: "scan", modo, categoria: modo === "referencias" && !elegidas ? categoria : null, ids: elegidas }, window.location.origin);
  }

  const desactualizada = version !== null && comparar(version, VERSION_MINIMA) < 0;
  const nElegidas = modo === "referencias" ? (ids?.length ?? 0) : 0;

  if (detectada === false) {
    return (
      <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
        No detecto la extensión «HALO Virales» en este Chrome. Instálala desde la carpeta <code>extension</code> del proyecto (chrome://extensions → Modo desarrollador → Cargar descomprimida) y recarga esta página.
      </p>
    );
  }

  return (
    <div className="space-y-2">
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
        <button
          onClick={lanzar}
          disabled={detectada !== true || corriendo || desactualizada}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {corriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          {corriendo ? `Analizando ${hechas}/${total}…` : nElegidas ? `Buscar virales en ${nElegidas} cuenta${nElegidas === 1 ? "" : "s"} elegida${nElegidas === 1 ? "" : "s"}` : modo === "referencias" ? "Buscar virales con la extensión" : "Buscar virales de mis modelos"}
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
