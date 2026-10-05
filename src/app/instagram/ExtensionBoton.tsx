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

// Boton que lanza la extension de Chrome "HALO Virales" desde el propio panel (la extension tiene
// que estar instalada en este Chrome). Habla con ella por window.postMessage.
export function ExtensionBoton({ modo }: { modo: "referencias" | "propias" }) {
  const router = useRouter();
  const [detectada, setDetectada] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoExt | null>(null);
  const [categoria, setCategoria] = useState("todas");
  const antes = useRef(false);

  useEffect(() => {
    function onMsg(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "halo-ext") return;
      const d = event.data as { type: string; estado?: EstadoExt };
      if (d.type === "pong" || d.type === "ready") setDetectada(true);
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
    window.postMessage({ source: "halo-panel", type: "scan", modo, categoria: modo === "referencias" ? categoria : null }, window.location.origin);
  }

  if (detectada === false) {
    return (
      <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
        No detecto la extensión «HALO Virales» en este Chrome. Instálala desde la carpeta <code>extension</code> del proyecto (chrome://extensions → Modo desarrollador → Cargar descomprimida) y recarga esta página.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {modo === "referencias" ? (
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={corriendo} className="input-base py-1.5 text-xs">
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        ) : null}
        <button
          onClick={lanzar}
          disabled={detectada !== true || corriendo}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {corriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          {corriendo ? `Analizando ${hechas}/${total}…` : modo === "referencias" ? "Buscar virales con la extensión" : "Buscar virales de mis modelos"}
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
