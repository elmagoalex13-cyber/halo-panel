"use client";

import { useMemo, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { Badge } from "@/components/Badge";
import { VideoPlayer } from "@/components/VideoPlayer";
import { formatRelative, tipoVideoLabel } from "@/lib/utils";
import type { LibraryContent, Modelo } from "@/types";

export function AprobacionClient({ videos, modelos }: { videos: LibraryContent[]; modelos: Modelo[] }) {
  const [selectedModelo, setSelectedModelo] = useState("todos");
  const [rejecting, setRejecting] = useState<LibraryContent | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filteredVideos = useMemo(
    () => videos.filter((video) => selectedModelo === "todos" || video.modelo_id === selectedModelo),
    [selectedModelo, videos],
  );

  async function updateVideo(id: string, accion: "aprobar" | "rechazar", motivoRechazo?: string) {
    setPendingId(id);
    await fetch("/api/aprobacion", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accion, motivo: motivoRechazo }),
    });
    setPendingId(null);
    setRejecting(null);
    setMotivo("");
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[color:var(--text-secondary)]">{filteredVideos.length} videos listos para revisar</p>
        <select className="input h-10 px-3 text-sm" value={selectedModelo} onChange={(event) => setSelectedModelo(event.target.value)}>
          <option value="todos">Todas las modelos</option>
          {modelos.map((modelo) => (
            <option key={modelo.id} value={modelo.id}>
              {modelo.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {filteredVideos.map((video) => (
          <article key={video.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <VideoPlayer src={video.signed_url ?? ""} title={video.filename_original} />
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">{video.modelo_nombre}</h2>
                <p className="text-sm text-[color:var(--text-secondary)]">{tipoVideoLabel(video.tipo_video)} - {formatRelative(video.recibido_at)}</p>
              </div>
              <Badge status={video.estado} />
            </div>
            <p className="mt-3 min-h-12 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-[color:var(--text-secondary)]">
              {video.notas_editor ?? "Sin notas del editor"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button className="btn-primary flex h-10 items-center justify-center gap-2 text-sm" disabled={pendingId === video.id} onClick={() => updateVideo(video.id, "aprobar")}>
                <Check className="h-4 w-4" /> Aprobar
              </button>
              <button className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-red-400/25 bg-red-500/10 text-sm font-semibold text-red-200" onClick={() => setRejecting(video)}>
                <X className="h-4 w-4" /> Rechazar
              </button>
              <a className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-white/[0.1] bg-white/[0.04] text-sm font-semibold text-white" href={video.signed_url} download>
                <Download className="h-4 w-4" /> Descargar
              </a>
            </div>
          </article>
        ))}
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-5">
            <h2 className="font-display text-2xl font-semibold text-white">Motivo de rechazo</h2>
            <textarea className="input mt-4 min-h-32 w-full p-3 text-sm" value={motivo} onChange={(event) => setMotivo(event.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="h-10 rounded-[10px] border border-white/[0.1] bg-white/[0.04] px-4 text-sm text-white" onClick={() => setRejecting(null)}>Cancelar</button>
              <button className="btn-primary h-10 px-4 text-sm" onClick={() => updateVideo(rejecting.id, "rechazar", motivo)}>Guardar rechazo</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
