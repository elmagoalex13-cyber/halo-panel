"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Download, Film, Image as ImageIcon, Play, Trash2 } from "lucide-react";
import { Visor, type ItemVisor } from "../Visor";
import { AvatarModelo } from "@/components/AvatarModelo";
import { GlassCard } from "@/components/GlassCard";
import {
  FASES,
  archivosDeSlot,
  duracionVsPedido,
  formatoDuracion,
  formatoTamano,
  progresoScript,
  type ArchivoOF,
  type ColeccionOF,
  type SlotFase,
} from "@/lib/onlyfans";

export type ArchivoConVista = ArchivoOF & { vista: string | null };

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Descarga varios archivos seguidos (uno detras de otro). Chrome pide permiso la primera vez ("descargar varios archivos"): permitir.
async function descargarVarios(ids: string[]) {
  for (const id of ids) {
    const a = document.createElement("a");
    a.href = `/api/onlyfans/descargar?id=${id}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    await pausa(900);
  }
}

function Foto({ a, descargado, onAbrir }: { a: ArchivoConVista; descargado: boolean; onAbrir: (a: ArchivoConVista) => void }) {
  const [fallo, setFallo] = useState(false);
  return (
    <div onClick={() => onAbrir(a)} title={a.nombre_original ?? "Ver foto"} className="group relative block cursor-zoom-in">
      <div className="aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {a.vista && !fallo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.vista} alt="" loading="lazy" onError={() => setFallo(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-1 text-center text-[10px] text-white/40">
            <ImageIcon className="mx-auto mb-1 h-5 w-5" />
            {a.nombre_original?.split(".").pop()?.toUpperCase() ?? "FOTO"}
            <br />
            (sin vista previa)
          </div>
        )}
      </div>
      <a
        href={`/api/onlyfans/descargar?id=${a.id}`}
        onClick={(e) => e.stopPropagation()}
        title="Descargar"
        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-xl bg-black/75 py-1.5 text-[11px] font-semibold text-white opacity-0 transition hover:bg-[#8B5CF6]/80 group-hover:opacity-100"
      >
        <Download className="h-3 w-3" /> Descargar
      </a>
      {!descargado ? <span className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#8B5CF6] ring-2 ring-black/60" title="Sin descargar" /> : null}
      {a.subido_of_at ? <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-black" title="Subido a OnlyFans"><Check className="h-3 w-3" /></span> : null}
    </div>
  );
}

function Video({ a, slot, onAbrir }: { a: ArchivoConVista; slot?: SlotFase | null; onAbrir: (a: ArchivoConVista) => void }) {
  const dur = duracionVsPedido(slot, a.duracion_seg);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
      <div className="flex items-center gap-3">
        <button onClick={() => onAbrir(a)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20" title="Ver">
          <Play className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm text-white/85">
            {!a.descargado_at ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#8B5CF6]" title="Sin descargar" /> : null}
            <span className="truncate">{a.nombre_original ?? "Vídeo"}</span>
            {a.subido_of_at ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : null}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/40">
            {[formatoDuracion(a.duracion_seg), formatoTamano(a.size_bytes)].filter(Boolean).join(" · ")}
            {dur ? (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                {dur === "corto" ? "Más corto de lo pedido" : "Más largo de lo pedido"}
              </span>
            ) : null}
          </p>
        </div>
        <a href={`/api/onlyfans/descargar?id=${a.id}`} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-950/50">
          <Download className="h-3.5 w-3.5" /> Descargar
        </a>
      </div>
    </div>
  );
}

export function ColeccionDetalle({
  coleccion,
  modelo,
  archivos: iniciales,
}: {
  coleccion: ColeccionOF;
  modelo: { id: string; nombre: string; foto: number | null };
  archivos: ArchivoConVista[];
}) {
  const router = useRouter();
  const [archivos, setArchivos] = useState(iniciales);
  const [estado, setEstado] = useState(coleccion.estado);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [visor, setVisor] = useState<number | null>(null);

  // Orden del visor: el mismo que ves en pantalla (fase a fase, fotos y videos)
  const ordenados = [...archivos].sort((x, y) => (x.fase ?? 0) - (y.fase ?? 0) || (x.tipo_archivo === y.tipo_archivo ? 0 : x.tipo_archivo === "video" ? -1 : 1) || x.orden - y.orden);
  const itemsVisor: ItemVisor[] = ordenados.map((a) => ({
    id: a.id,
    tipo_archivo: a.tipo_archivo,
    nombre_original: a.nombre_original,
    size_bytes: a.size_bytes,
    duracion_seg: a.duracion_seg,
    vista: a.vista,
    etiqueta: a.fase ? `Fase ${a.fase} · ${a.tipo_archivo === "video" ? "vídeo" : `foto ${a.orden}`}` : undefined,
  }));
  const abrir = (a: ArchivoConVista) => {
    const i = ordenados.findIndex((x) => x.id === a.id);
    if (i >= 0) setVisor(i);
  };

  const esScript = coleccion.tipo === "script";
  const pr = esScript ? progresoScript(archivos) : null;
  const bytes = archivos.reduce((s, a) => s + (a.size_bytes ?? 0), 0);
  const todoSubido = archivos.length > 0 && archivos.every((a) => a.subido_of_at);

  async function descargar(ids: string[], etiqueta: string) {
    setOcupado(etiqueta);
    setAviso({ ok: true, texto: `Descargando ${ids.length} archivo${ids.length === 1 ? "" : "s"}… (si el navegador pregunta por descargar varios archivos, permítelo)` });
    await descargarVarios(ids);
    const ahora = new Date().toISOString();
    setArchivos((p) => p.map((a) => (ids.includes(a.id) && !a.descargado_at ? { ...a, descargado_at: ahora } : a)));
    setOcupado(null);
    setAviso({ ok: true, texto: "Descargas lanzadas. Revisa la carpeta de descargas." });
  }

  async function marcar(fase: number | null, subido: boolean) {
    setOcupado(`marcar-${fase ?? "todo"}`);
    try {
      const res = await fetch("/api/onlyfans/marcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coleccion_id: coleccion.id, fase, subido }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; subido_of_at?: string | null };
      if (!res.ok) throw new Error(j.error ?? "No se pudo marcar");
      setArchivos((p) => p.map((a) => (fase === null || a.fase === fase ? { ...a, subido_of_at: j.subido_of_at ?? null } : a)));
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo marcar" });
    } finally {
      setOcupado(null);
    }
  }

  async function reabrir() {
    if (!window.confirm("¿Reabrir? La modelo podrá volver a subir y quitar archivos.")) return;
    const res = await fetch("/api/onlyfans/coleccion", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: coleccion.id, accion: "reabrir" }) });
    if (res.ok) {
      setEstado("en_curso");
      setAviso({ ok: true, texto: "Reabierto: la modelo ya puede modificarlo." });
    } else setAviso({ ok: false, texto: "No se pudo reabrir" });
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar «${coleccion.nombre}» y sus ${archivos.length} archivos (${formatoTamano(bytes) || "0 MB"})? No se puede deshacer.`)) return;
    setBorrando(true);
    const res = await fetch(`/api/onlyfans/coleccion?id=${coleccion.id}`, { method: "DELETE" });
    if (res.ok) router.push("/onlyfans");
    else {
      setBorrando(false);
      setAviso({ ok: false, texto: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo borrar" });
    }
  }

  const boton = "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40";
  const idsDe = (xs: ArchivoConVista[]) => xs.map((a) => a.id);

  return (
    <div className="space-y-5">
      <Link href="/onlyfans" className="text-sm text-white/50 hover:text-white">← OnlyFans</Link>

      <GlassCard className="space-y-3 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <AvatarModelo id={modelo.id} nombre={modelo.nombre} foto={modelo.foto} className="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold text-white">{coleccion.nombre}</h1>
            <p className="text-sm text-white/45">
              {modelo.nombre} · {coleccion.tipo === "script" ? "Script" : coleccion.tipo === "pack" ? "Pack" : "Post"}
              {pr ? ` · ${pr.fasesCompletas}/8 fases completas` : ""} · {archivos.length} archivos · {formatoTamano(bytes) || "0 MB"}
            </p>
            {coleccion.descripcion ? <p className="mt-1 text-sm text-white/60">{coleccion.descripcion}</p> : null}
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${estado === "entregado" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
            {estado === "entregado" ? "Entregado" : "En curso: la modelo lo está subiendo"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!archivos.length || ocupado !== null} onClick={() => descargar(idsDe(archivos), "todo")} className={`${boton} border-[#8B5CF6]/40 bg-[#8B5CF6]/15 text-[#c4b5fd] hover:bg-[#8B5CF6]/25`}>
            <Download className="h-3.5 w-3.5" /> Descargar todo ({archivos.length})
          </button>
          <button disabled={!archivos.length || ocupado !== null} onClick={() => marcar(null, !todoSubido)} className={`${boton} ${todoSubido ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-white/[0.04] text-white/70 hover:text-white"}`}>
            <Check className="h-3.5 w-3.5" /> {todoSubido ? "Subido a OnlyFans (deshacer)" : "Marcar todo como subido a OnlyFans"}
          </button>
          {estado === "entregado" ? (
            <button onClick={reabrir} className={`${boton} border-white/15 bg-white/[0.04] text-white/70 hover:text-white`}>Reabrir para la modelo</button>
          ) : null}
          <button disabled={borrando} onClick={borrar} className={`${boton} ml-auto border-red-900/50 bg-red-950/40 text-red-300 hover:bg-red-950/70`}>
            <Trash2 className="h-3.5 w-3.5" /> Borrar
          </button>
        </div>
        {aviso ? <p className={`rounded-lg px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.texto}</p> : null}
        <p className="text-xs text-white/30">
          Las descargas son el archivo exacto que subió la modelo, sin recomprimir, con el nombre ordenado por fase (ej. {modelo.nombre}_{coleccion.nombre.replace(/\s+/g, "_")}_F03_video.mov).
        </p>
      </GlassCard>

      {esScript ? (
        <div className="space-y-4">
          {FASES.map((f) => {
            const delaFase = archivos.filter((a) => a.fase === f.fase);
            const subidaOF = delaFase.length > 0 && delaFase.every((a) => a.subido_of_at);
            const sin = delaFase.filter((a) => !a.descargado_at).length;
            const pedidos = f.slots.reduce((s, x) => s + x.n, 0);
            return (
              <GlassCard key={f.fase} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${delaFase.length >= pedidos ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/70"}`}>{f.fase}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-white">Fase {f.fase} · {f.nombre}</h2>
                    <p className="text-xs text-white/40">{f.resumen} · subido {delaFase.length}/{pedidos}{sin ? ` · ${sin} sin descargar` : ""}</p>
                  </div>
                  <button disabled={!delaFase.length || ocupado !== null} onClick={() => descargar(idsDe(delaFase), `fase${f.fase}`)} className={`${boton} border-[#8B5CF6]/40 bg-[#8B5CF6]/15 text-[#c4b5fd] hover:bg-[#8B5CF6]/25`}>
                    <Download className="h-3.5 w-3.5" /> Descargar fase {f.fase}
                  </button>
                  <button disabled={!delaFase.length || ocupado !== null} onClick={() => marcar(f.fase, !subidaOF)} className={`${boton} ${subidaOF ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"}`}>
                    <Check className="h-3.5 w-3.5" /> {subidaOF ? "Subida a OF" : "Marcar subida a OF"}
                  </button>
                </div>
                {delaFase.length === 0 ? <p className="text-xs text-white/30">La modelo todavía no ha subido nada de esta fase.</p> : null}
                {f.slots.map((s) => {
                  const xs = archivosDeSlot(delaFase, f.fase, s.slot) as ArchivoConVista[];
                  if (!xs.length) return null;
                  return (
                    <div key={s.slot} className="space-y-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
                        {s.tipo === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} {s.etiqueta} · {xs.length}/{s.n}
                      </p>
                      {s.tipo === "video" ? (
                        <div className="space-y-2">{xs.map((a) => <Video key={a.id} a={a} slot={s} onAbrir={abrir} />)}</div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{xs.map((a) => <Foto key={a.id} a={a} descargado={Boolean(a.descargado_at)} onAbrir={abrir} />)}</div>
                      )}
                    </div>
                  );
                })}
              </GlassCard>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {archivos.some((a) => a.tipo_archivo === "video") ? (
            <GlassCard className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Vídeos · {archivos.filter((a) => a.tipo_archivo === "video").length}</p>
              {archivos.filter((a) => a.tipo_archivo === "video").map((a) => <Video key={a.id} a={a} onAbrir={abrir} />)}
            </GlassCard>
          ) : null}
          {archivos.some((a) => a.tipo_archivo === "foto") ? (
            <GlassCard className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Fotos · {archivos.filter((a) => a.tipo_archivo === "foto").length}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {archivos.filter((a) => a.tipo_archivo === "foto").map((a) => <Foto key={a.id} a={a} descargado={Boolean(a.descargado_at)} onAbrir={abrir} />)}
              </div>
            </GlassCard>
          ) : null}
          {!archivos.length ? <p className="text-sm text-white/35">La modelo todavía no ha subido nada.</p> : null}
        </div>
      )}
      {visor !== null ? <Visor items={itemsVisor} indice={visor} onCambio={setVisor} onCerrar={() => setVisor(null)} /> : null}
    </div>
  );
}
