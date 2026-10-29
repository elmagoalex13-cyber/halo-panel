"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Upload } from "lucide-react";
import { agregar, diag, obtener, obtenerServidor, suscribir } from "./subidaVideos";

/**
 * Boton para elegir videos. La subida la lleva el motor de subidas (subidaVideos.ts) y su avance se ve en la barra fija de abajo (BarraSubidas),
 * asi sigue aunque la modelo cambie de pestaña del portal. Se pueden seguir anadiendo videos mientras otros suben.
 */
export function SubirBoton({
  tipo,
  encargoId,
  referenciaId,
  etiqueta = "Subir mi video",
}: {
  tipo: number;
  encargoId?: string;
  referenciaId?: string;
  etiqueta?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [esperando, setEsperando] = useState(false); // ha abierto el selector y todavia no ha llegado ningun video
  const abiertoEn = useRef(0);
  const estado = useSyncExternalStore(suscribir, obtener, obtenerServidor);
  const ctx = `${tipo}|${encargoId ?? ""}`;
  const mios = estado.items.filter((i) => i.ctx === ctx && (i.estado === "cola" || i.estado === "subiendo"));
  const total = mios.reduce((s, i) => s + i.size, 0);
  const hecho = mios.reduce((s, i) => s + i.subido, 0);
  const pct = total ? Math.min(100, Math.round((hecho / total) * 100)) : 0;
  const subiendo = mios.length > 0;
  // Un video pendiente concreto (encargo) solo admite un archivo mientras sube
  const bloqueado = Boolean(encargoId) && subiendo;
  useEffect(() => {
    if (!esperando) return;
    const t = window.setTimeout(() => setEsperando(false), 90000);
    return () => window.clearTimeout(t);
  }, [esperando]);

  return (
    <div>
      {/* Etiqueta nativa en vez de input.click(): asi el selector se abre tambien en el movil y en los navegadores de WhatsApp o Instagram */}
      <label className={`btn-primary relative flex h-12 w-full cursor-pointer items-center justify-center overflow-hidden text-base ${bloqueado ? "pointer-events-none opacity-80" : ""}`}>
        <input
          ref={input}
          type="file"
          accept="video/*"
          multiple={!encargoId}
          disabled={bloqueado}
          className="sr-only"
          onClick={() => {
            // Se vacia al ABRIR el selector (no justo al elegir: en el iPhone eso puede invalidar el archivo recien elegido) para poder volver a elegir el mismo video
            if (input.current) input.current.value = "";
            abiertoEn.current = Date.now();
            setEsperando(true);
            diag("abrir_selector", { tipo });
          }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            diag("elegido", { n: files.length, espera_s: Math.round((Date.now() - abiertoEn.current) / 1000), tam: files.map((f) => Math.round(f.size / 1e6)) });
            setEsperando(false);
            if (files.length) agregar(files, { tipo, encargoId, referenciaId });
          }}
        />
        {subiendo ? (
          <>
            <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct}%` }} />
            <span className="relative">
              Subiendo {mios.length > 1 ? `${mios.length} vídeos · ` : ""}
              {pct}%{encargoId ? "" : " · pulsa para añadir más"}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {etiqueta}
          </span>
        )}
      </label>
      {esperando && !subiendo ? (
        <p className="mt-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs leading-relaxed text-white/60">
          Elige el vídeo y confírmalo (✓). El iPhone puede tardar unos segundos, o más si el vídeo es grande o está en iCloud, en prepararlo:{" "}
          <span className="text-white/80">no hace falta que lo vuelvas a elegir, empezará solo</span> y verás una barra abajo.
        </p>
      ) : null}
    </div>
  );
}
