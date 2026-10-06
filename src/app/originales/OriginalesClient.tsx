"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Play, X } from "lucide-react";
import { AvatarModelo } from "@/components/AvatarModelo";
import { formatDate } from "@/lib/utils";
import { nombreTipo } from "@/lib/tiposEdicion";

export type PiezaDeOriginal = {
  id: string;
  estado: string;
  proceso: string | null;
  error: string | null;
  tipo: string | null;
  tieneEditado: boolean;
  fragmento: number | null;
};

export type Original = {
  id: string; // pieza mas reciente (sirve para ver/descargar el original)
  modelo_id: string | null;
  modelo_nombre: string;
  foto: number | null;
  archivo: string;
  tamano: number | null;
  recibido_at: string;
  piezas: PiezaDeOriginal[];
};

type EstadoClave = "error" | "editando" | "revisar" | "aprobado" | "publicado" | "descartado";

const ESTADOS: Record<EstadoClave, { label: string; clase: string }> = {
  error: { label: "Error al editar", clase: "border-red-500/40 bg-red-500/10 text-red-300" },
  editando: { label: "Editando", clase: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  revisar: { label: "Para revisar", clase: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  aprobado: { label: "Aprobado", clase: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  publicado: { label: "Publicado", clase: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  descartado: { label: "Descartado", clase: "border-white/15 bg-white/[0.04] text-white/45" },
};

function estadoPieza(p: PiezaDeOriginal): EstadoClave {
  if (p.proceso === "error") return "error";
  if (p.estado === "publicado") return "publicado";
  if (p.estado === "aprobado") return "aprobado";
  if (p.estado === "en_aprobacion") return "revisar";
  if (p.estado === "rechazado" || p.estado === "descartado") return "descartado";
  return "editando";
}

// Prioridad al mostrar el estado de un original que tiene varias piezas: lo que pide atencion primero.
const PRIORIDAD: EstadoClave[] = ["error", "editando", "revisar", "aprobado", "publicado", "descartado"];
const estadoOriginal = (o: Original): EstadoClave => {
  const todos = o.piezas.map(estadoPieza);
  return PRIORIDAD.find((e) => todos.includes(e)) ?? "editando";
};

function tamano(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function OriginalesClient({
  originales,
  modelos,
}: {
  originales: Original[];
  modelos: Array<{ id: string; nombre: string; foto: number | null }>;
}) {
  const [modelo, setModelo] = useState("todas");
  const [estado, setEstado] = useState<"todos" | EstadoClave>("todos");
  const [busca, setBusca] = useState("");
  const [viendo, setViendo] = useState<Original | null>(null);

  // Si el modelo elegido ya no tiene videos, el filtro vuelve solo a "todas".
  const modeloActivo = modelo !== "todas" && !modelos.some((m) => m.id === modelo) ? "todas" : modelo;

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return originales
      .filter((o) => modeloActivo === "todas" || o.modelo_id === modeloActivo)
      .filter((o) => estado === "todos" || estadoOriginal(o) === estado)
      .filter((o) => !q || o.archivo.toLowerCase().includes(q) || o.modelo_nombre.toLowerCase().includes(q));
  }, [originales, modeloActivo, estado, busca]);

  const conteo = (e: EstadoClave) => originales.filter((o) => estadoOriginal(o) === e).length;
  const hace24h = Date.now() - 24 * 3600000;

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModelo("todas")} className={chip(modeloActivo === "todas")}>
          Todas ({originales.length})
        </button>
        {modelos.map((m) => (
          <button key={m.id} onClick={() => setModelo(m.id)} className={`${chip(modeloActivo === m.id)} flex items-center gap-1.5`}>
            <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-4 w-4 text-[8px]" />
            {m.nombre} ({originales.filter((o) => o.modelo_id === m.id).length})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEstado("todos")} className={chip(estado === "todos")}>
          Cualquier estado
        </button>
        {PRIORIDAD.filter((e) => conteo(e) > 0).map((e) => (
          <button key={e} onClick={() => setEstado(e)} className={chip(estado === e)}>
            {ESTADOS[e].label} ({conteo(e)})
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nombre de archivo…"
          className="input-base ml-auto w-full py-1.5 text-xs sm:w-64"
        />
      </div>

      {visibles.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {originales.length === 0 ? "Todavía no han subido ningún video." : "Ningún video con esos filtros."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <ul className="divide-y divide-white/[0.06]">
            {visibles.map((o) => {
              const e = estadoOriginal(o);
              const editadas = o.piezas.filter((p) => p.tieneEditado);
              const errores = o.piezas.filter((p) => p.error).map((p) => p.error as string);
              const nuevo = new Date(o.recibido_at).getTime() >= hace24h;
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                  <AvatarModelo id={o.modelo_id} nombre={o.modelo_nombre} foto={o.foto} className="h-9 w-9 text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                      <span className="truncate">{o.archivo}</span>
                      {nuevo ? <span className="rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] font-semibold text-white">Nuevo</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {o.modelo_nombre} · {formatDate(o.recibido_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {tamano(o.tamano) ? ` · ${tamano(o.tamano)}` : ""}
                      {o.piezas[0]?.tipo?.match(/[1-4]/) ? ` · Tipo ${o.piezas[0].tipo.match(/[1-4]/)![0]} ${nombreTipo(Number(o.piezas[0].tipo.match(/[1-4]/)![0]))}` : ""}
                      {o.piezas.length > 1 ? ` · ${o.piezas.length} piezas` : ""}
                    </p>
                    {errores.length ? <p className="mt-1 line-clamp-1 text-xs text-red-300/80">{errores[0]}</p> : null}
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ESTADOS[e].clase}`}>{ESTADOS[e].label}</span>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      onClick={() => setViendo(o)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                    >
                      <Play className="h-3.5 w-3.5" /> Ver
                    </button>
                    <a
                      href={`/api/descargar?id=${o.id}&tipo=original`}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-950/50"
                    >
                      <Download className="h-3.5 w-3.5" /> Original
                    </a>
                    {editadas.length ? (
                      <a
                        href={`/api/descargar?id=${editadas[0].id}&tipo=editado`}
                        title={editadas.length > 1 ? `Descarga la última de ${editadas.length} versiones editadas (las demás están en Aprobación)` : "Descargar la versión editada por la IA"}
                        className="flex items-center gap-1.5 rounded-lg border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-2.5 py-1.5 text-xs font-semibold text-[#A78BFA] transition hover:bg-[#8B5CF6]/20"
                      >
                        <Download className="h-3.5 w-3.5" /> Editado
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-white/30">
        Para revisar, aprobar o rehacer las versiones editadas ve a <Link href="/aprobacion" className="text-[#A78BFA] hover:underline">Aprobación</Link>.
      </p>

      {viendo ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" onClick={() => setViendo(null)}>
          <div className="w-full max-w-sm" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between text-sm text-white">
              <span className="truncate">{viendo.archivo}</span>
              <button onClick={() => setViendo(null)} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <video src={`/api/aprobacion/original?id=${viendo.id}`} controls autoPlay playsInline className="aspect-[9/16] w-full rounded-xl bg-black object-contain ring-1 ring-white/10" />
            <p className="mt-2 text-xs text-white/40">Si es un .MOV de iPhone puede no verse en algunos navegadores: descárgalo con «Original».</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
