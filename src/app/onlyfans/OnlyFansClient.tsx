"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AvatarModelo } from "@/components/AvatarModelo";
import { ETIQUETA_TIPO, formatoTamano, type TipoColeccion } from "@/lib/onlyfans";
import type { ResumenColeccion } from "@/lib/ofResumen";
import { SelectorAmbito, PuntoAmbito, ambitoCoincide, type FiltroAmbito } from "@/components/SelectorAmbito";

export function OnlyFansClient({
  modelos: modelosTodas,
  colecciones: coleccionesTodas,
  modeloInicial,
  sinFiltroModelo = false,
  esDueno = false,
  ambitos = {},
}: {
  esDueno?: boolean;
  ambitos?: Record<string, string>;
  modelos: Array<{ id: string; nombre: string; foto: number | null }>;
  colecciones: ResumenColeccion[];
  modeloInicial?: string;
  sinFiltroModelo?: boolean; // dentro de la ficha de una modelo ya esta filtrado
}) {
  const [filtroAmbito, setFiltroAmbito] = useState<FiltroAmbito>("todas");
  // Con el selector del dueño (mis modelos / con mi socio) solo quedan las modelos de ese grupo y su contenido
  const modelos = modelosTodas.filter((m) => ambitoCoincide(filtroAmbito, ambitos[m.id]));
  const colecciones = coleccionesTodas.filter((c) => ambitoCoincide(filtroAmbito, ambitos[c.modelo_id]));
  const [modelo, setModelo] = useState(modeloInicial && modelosTodas.some((m) => m.id === modeloInicial) ? modeloInicial : "todas");
  const [tipo, setTipo] = useState<TipoColeccion>("script");
  const [estado, setEstado] = useState<"todos" | "entregado" | "en_curso" | "por_subir">("todos");

  // Todas las modelos, tengan o no contenido todavia (las que no, salen apagadas con un 0)
  const modeloActivo = modelo !== "todas" && !modelos.some((m) => m.id === modelo) ? "todas" : modelo;
  const delModelo = colecciones.filter((c) => modeloActivo === "todas" || c.modelo_id === modeloActivo);

  const visibles = useMemo(
    () =>
      delModelo
        .filter((c) => c.tipo === tipo)
        .filter((c) => estado === "todos" || (estado === "por_subir" ? c.estado === "entregado" && c.subidosOF < c.archivos : c.estado === estado)),
    [delModelo, tipo, estado],
  );

  const conteoTipo = (t: TipoColeccion) => delModelo.filter((c) => c.tipo === t).length;
  const sinDescargarTotal = delModelo.reduce((s, c) => s + c.sinDescargar, 0);
  const porSubirOF = delModelo.filter((c) => c.estado === "entregado" && c.subidosOF < c.archivos).length;
  const espacio = delModelo.reduce((s, c) => s + c.bytes, 0);

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80"}`;

  return (
    <div className="space-y-4">
      {sinFiltroModelo ? null : (
        <SelectorAmbito esDueno={esDueno} valor={filtroAmbito} onChange={setFiltroAmbito} cuenta={(f) => modelosTodas.filter((m) => ambitoCoincide(f, ambitos[m.id])).length} />
      )}
      {sinFiltroModelo ? null : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModelo("todas")} className={chip(modeloActivo === "todas")}>
            Todas las modelos ({colecciones.length})
            {colecciones.some((c) => c.nuevo) ? <span className="ml-1.5 rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] text-white">{colecciones.filter((c) => c.nuevo).length} nuevo{colecciones.filter((c) => c.nuevo).length === 1 ? "" : "s"}</span> : null}
          </button>
          {modelos.map((m) => {
            const n = colecciones.filter((c) => c.modelo_id === m.id);
            const nuevos = n.filter((c) => c.nuevo).length;
            return (
              <button key={m.id} onClick={() => setModelo(m.id)} className={`${chip(modeloActivo === m.id)} flex items-center gap-1.5 ${n.length ? "" : "opacity-50"}`}>
                <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-4 w-4 text-[8px]" />
                {esDueno ? <PuntoAmbito ambito={ambitos[m.id]} /> : null}
                {m.nombre} ({n.length})
                {nuevos ? <span className="rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] text-white">{nuevos} nuevo{nuevos === 1 ? "" : "s"}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-xs text-white/45">Por subir a OnlyFans</p>
          <p className="mt-1 text-2xl font-semibold text-white">{porSubirOF}</p>
          <p className="text-xs text-white/35">entregados que aún no has marcado como subidos</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-xs text-white/45">Archivos sin descargar</p>
          <p className="mt-1 text-2xl font-semibold text-white">{sinDescargarTotal}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-xs text-white/45">Espacio ocupado</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatoTamano(espacio) || "0 MB"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08]">
        {(["script", "pack", "post"] as TipoColeccion[]).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`px-4 py-2.5 text-sm font-semibold transition ${tipo === t ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"}`}
          >
            {ETIQUETA_TIPO[t]} <span className="text-xs opacity-60">{conteoTipo(t)}</span>
          </button>
        ))}
        <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="input-base ml-auto py-1.5 text-xs">
          <option value="todos">Cualquier estado</option>
          <option value="en_curso">En curso (la modelo lo está subiendo)</option>
          <option value="entregado">Entregados</option>
          <option value="por_subir">Entregados · por subir a OnlyFans</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {colecciones.length === 0 ? "Todavía no han subido nada. Las modelos lo hacen desde su portal, en la pestaña «Contenido»." : "Nada con esos filtros."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const todoSubido = c.archivos > 0 && c.subidosOF >= c.archivos;
            return (
              <Link key={c.id} href={`/onlyfans/${c.id}`} className="flex flex-col gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]">
                <div className="flex items-center gap-2">
                  <AvatarModelo id={c.modelo_id} nombre={c.modelo_nombre} foto={modelos.find((m) => m.id === c.modelo_id)?.foto ?? null} className="h-7 w-7 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{c.nombre}</p>
                    <p className="text-xs text-white/40">{c.modelo_nombre} · {new Date(c.entregado_at ?? c.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p>
                  </div>
                  {c.nuevo ? <span className="shrink-0 rounded-full bg-[#8B5CF6] px-2 py-0.5 text-[11px] font-semibold text-white">Nuevo</span> : null}
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.estado === "entregado" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                    {c.estado === "entregado" ? "Entregado" : "En curso"}
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  {c.fasesCompletas !== null ? `${c.fasesCompletas}/8 fases completas · ` : ""}
                  {c.videos} vídeo{c.videos === 1 ? "" : "s"} · {c.fotos} foto{c.fotos === 1 ? "" : "s"} · {formatoTamano(c.bytes) || "0 MB"}
                </p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {c.sinDescargar > 0 ? <span className="rounded-full bg-[#8B5CF6]/20 px-2 py-0.5 text-[#c4b5fd]">{c.sinDescargar} sin descargar</span> : null}
                  {todoSubido ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">Subido a OnlyFans</span>
                  ) : c.subidosOF > 0 ? (
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">{c.subidosOF}/{c.archivos} subidos a OnlyFans</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
