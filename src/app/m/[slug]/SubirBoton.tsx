"use client";

import { useRef, useSyncExternalStore } from "react";
import { Upload } from "lucide-react";
import { agregar, obtener, obtenerServidor, suscribir } from "./subidaVideos";

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
  const estado = useSyncExternalStore(suscribir, obtener, obtenerServidor);
  const ctx = `${tipo}|${encargoId ?? ""}`;
  const mios = estado.items.filter((i) => i.ctx === ctx && (i.estado === "cola" || i.estado === "subiendo"));
  const total = mios.reduce((s, i) => s + i.size, 0);
  const hecho = mios.reduce((s, i) => s + i.subido, 0);
  const pct = total ? Math.min(100, Math.round((hecho / total) * 100)) : 0;
  const subiendo = mios.length > 0;
  // Un video pendiente concreto (encargo) solo admite un archivo mientras sube
  const bloqueado = Boolean(encargoId) && subiendo;

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
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) agregar(files, { tipo, encargoId, referenciaId });
            if (input.current) input.current.value = "";
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
    </div>
  );
}
