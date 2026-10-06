"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Film, Image as ImageIcon, Plus, Upload, X } from "lucide-react";
import {
  ETIQUETA_TIPO,
  FASES,
  archivosDeSlot,
  formatoTamano,
  progresoScript,
  resumenPortal,
  type ArchivoOF,
  type ColeccionOF,
  type TipoColeccion,
} from "@/lib/onlyfans";
import { subirArchivoOF } from "./subidaOF";

export type ArchivoVista = ArchivoOF & { vista?: string | null };

const BTN_SUBIR = "relative flex min-h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#8B5CF6]/25 px-3 text-sm font-semibold text-white transition hover:bg-[#8B5CF6]/35 disabled:opacity-70";

function Miniatura({ a, onQuitar, bloqueado }: { a: ArchivoVista; onQuitar: (a: ArchivoVista) => void; bloqueado: boolean }) {
  const [fallo, setFallo] = useState(false);
  return (
    <div className="relative">
      <div className="aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {a.vista && !fallo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.vista} alt="" loading="lazy" onError={() => setFallo(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-1 text-center text-[10px] text-white/40">
            <ImageIcon className="mx-auto mb-1 h-5 w-5" />
            {a.nombre_original?.split(".").pop()?.toUpperCase() ?? "FOTO"} subida
          </div>
        )}
      </div>
      {!bloqueado ? (
        <button
          type="button"
          onClick={() => onQuitar(a)}
          aria-label="Quitar"
          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/20 hover:bg-red-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

// La modelo NO ve nada sobre la duracion; se guarda al subir y solo la ve la agencia.
function FilaVideo({ a, onQuitar, bloqueado }: { a: ArchivoVista; onQuitar: (a: ArchivoVista) => void; bloqueado: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
        <Check className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/85">{a.nombre_original ?? "Vídeo"}</p>
        <p className="text-xs text-white/40">{formatoTamano(a.size_bytes)}</p>
      </div>
      {!bloqueado ? (
        <button type="button" onClick={() => onQuitar(a)} aria-label="Quitar" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/40 hover:bg-red-500/20 hover:text-red-300">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

// Boton que sube uno o varios archivos a un hueco (o a un pack/post) con barra de progreso.
function BotonSubida({
  etiqueta,
  accept,
  coleccionId,
  fase,
  slot,
  onSubido,
  onOcupado,
}: {
  etiqueta: string;
  accept: string;
  coleccionId: string;
  fase?: number;
  slot?: string;
  onSubido: (r: { archivo: ArchivoOF; vista: string | null }) => void;
  onOcupado: (ocupado: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(files: File[]) {
    setError(null);
    const lista = files;
    const total = lista.reduce((s, f) => s + f.size, 0) || 1;
    const cargado = new Array(lista.length).fill(0) as number[];
    let hechos = 0;
    setProgreso(0);
    onOcupado(true);
    try {
      let siguiente = 0;
      await Promise.all(
        Array.from({ length: Math.min(2, lista.length) }, async () => {
          while (siguiente < lista.length) {
            const i = siguiente++;
            setInfo(lista.length > 1 ? `Subiendo ${Math.min(hechos + 1, lista.length)}/${lista.length}` : null);
            const r = await subirArchivoOF(lista[i], { coleccionId, fase, slot }, (l) => {
              cargado[i] = l;
              setProgreso(Math.min(100, Math.round((cargado.reduce((a, b) => a + b, 0) / total) * 100)));
            });
            hechos++;
            onSubido(r);
          }
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setProgreso(null);
      setInfo(null);
      onOcupado(false);
      if (input.current) input.current.value = "";
    }
  }

  const subiendo = progreso !== null;
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void subir(files);
        }}
      />
      <button type="button" disabled={subiendo} onClick={() => input.current?.click()} className={BTN_SUBIR}>
        {subiendo ? (
          <>
            <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progreso}%` }} />
            <span className="relative">
              {info ? `${info} · ` : "Subiendo "}
              {progreso}%
            </span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" /> {etiqueta}
          </>
        )}
      </button>
      {error ? <p className="mt-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

export function OnlyFansPortal({
  colecciones: iniciales,
  archivos: archivosIniciales,
}: {
  colecciones: ColeccionOF[];
  archivos: ArchivoVista[];
}) {
  const [colecciones, setColecciones] = useState(iniciales);
  const [archivos, setArchivos] = useState(archivosIniciales);
  const [tipo, setTipo] = useState<TipoColeccion>("script");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [faseAbierta, setFaseAbierta] = useState<number | null>(1);
  const [nuevo, setNuevo] = useState<{ nombre: string; descripcion: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [ocupadas, setOcupadas] = useState(0);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  // No dejar cerrar la pagina a mitad de una subida
  useEffect(() => {
    if (!ocupadas) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [ocupadas]);

  const col = colecciones.find((c) => c.id === abierta) ?? null;
  const delCol = (id: string) => archivos.filter((a) => a.coleccion_id === id);

  async function crear() {
    setCreando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/portal/of/coleccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, nombre: nuevo?.nombre ?? "", descripcion: nuevo?.descripcion ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { coleccion?: ColeccionOF; error?: string };
      if (!res.ok || !j.coleccion) throw new Error(j.error ?? "No se pudo crear");
      setColecciones((p) => [j.coleccion as ColeccionOF, ...p]);
      setNuevo(null);
      setAbierta(j.coleccion.id);
      setFaseAbierta(1);
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo crear" });
    } finally {
      setCreando(false);
    }
  }

  async function quitar(a: ArchivoVista) {
    if (!window.confirm("¿Quitar este archivo? Tendrás que volver a subirlo.")) return;
    const res = await fetch(`/api/portal/of/archivo?id=${a.id}`, { method: "DELETE" });
    if (res.ok) setArchivos((p) => p.filter((x) => x.id !== a.id));
    else setAviso({ ok: false, texto: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo quitar" });
  }

  async function entregar(c: ColeccionOF) {
    const pr = c.tipo === "script" ? progresoScript(delCol(c.id)) : null;
    const falta = pr && pr.subidos < pr.total ? `Faltan ${pr.total - pr.subidos} archivos de este script. ` : "";
    if (!window.confirm(`${falta}¿Marcar como entregado? Después no podrás cambiar los archivos.`)) return;
    const res = await fetch("/api/portal/of/entregar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coleccion_id: c.id }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; entregado_at?: string };
    if (!res.ok) return setAviso({ ok: false, texto: j.error ?? "No se pudo entregar" });
    setColecciones((p) => p.map((x) => (x.id === c.id ? { ...x, estado: "entregado", entregado_at: j.entregado_at ?? new Date().toISOString() } : x)));
    setAviso({ ok: true, texto: "¡Entregado! Tu agencia ya lo tiene." });
  }

  const alSubir = (r: { archivo: ArchivoOF; vista: string | null }) => setArchivos((p) => [...p, { ...r.archivo, vista: r.vista }]);
  const alOcupar = (o: boolean) => setOcupadas((n) => Math.max(0, n + (o ? 1 : -1)));

  /* ------------------------------------------------ detalle ------------------------------------------------ */
  if (col) {
    const mios = delCol(col.id);
    const bloqueado = col.estado === "entregado";
    const pr = col.tipo === "script" ? progresoScript(mios) : null;
    return (
      <section className="space-y-3">
        <button type="button" onClick={() => setAbierta(null)} className="text-sm text-white/50 hover:text-white">
          ← {ETIQUETA_TIPO[col.tipo]}
        </button>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold text-white">{col.nombre}</h2>
              {col.descripcion ? <p className="mt-1 text-sm text-white/50">{col.descripcion}</p> : null}
              <p className="mt-1 text-xs text-white/40">
                {pr ? `${pr.subidos}/${pr.total} archivos · ${pr.fasesCompletas}/8 fases completas` : `${mios.length} archivo${mios.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {bloqueado ? <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">Entregado</span> : null}
          </div>
          {pr ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#8B5CF6]" style={{ width: `${(pr.subidos / pr.total) * 100}%` }} />
            </div>
          ) : null}
        </div>
        {aviso ? <p className={`rounded-xl px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.texto}</p> : null}

        {col.tipo === "script" ? (
          <div className="space-y-2">
            {FASES.map((f) => {
              const abiertaF = faseAbierta === f.fase;
              const pedidos = f.slots.reduce((s, x) => s + x.n, 0);
              const subidos = f.slots.reduce((s, x) => s + Math.min(x.n, archivosDeSlot(mios, f.fase, x.slot).length), 0);
              const completa = subidos >= pedidos;
              return (
                <article key={f.fase} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                  <button type="button" onClick={() => setFaseAbierta(abiertaF ? null : f.fase)} className="flex w-full items-center gap-3 p-3 text-left">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${completa ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/70"}`}>
                      {completa ? <Check className="h-4 w-4" /> : f.fase}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">Fase {f.fase} · {f.nombre}</p>
                      <p className="text-xs text-white/40">{resumenPortal(f)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-white/50">{subidos}/{pedidos}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition ${abiertaF ? "rotate-180" : ""}`} />
                  </button>
                  {abiertaF ? (
                    <div className="space-y-4 border-t border-white/[0.08] p-3">
                      {f.slots.map((s) => {
                        const subidosSlot = archivosDeSlot(mios, f.fase, s.slot);
                        return (
                          <div key={s.slot} className="space-y-2">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                              {s.tipo === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                              {s.etiqueta} · {subidosSlot.length}
                              {subidosSlot.length >= s.n ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <span className="font-normal normal-case tracking-normal text-white/30">(mín. {s.n})</span>}
                              {s.tipo === "foto" && s.ayuda ? <span className="font-normal normal-case tracking-normal text-white/30">— {s.ayuda}</span> : null}
                            </p>
                            {s.tipo === "video" ? (
                              <div className="space-y-2">
                                {subidosSlot.map((a) => <FilaVideo key={a.id} a={a} onQuitar={quitar} bloqueado={bloqueado} />)}
                              </div>
                            ) : subidosSlot.length ? (
                              <div className="grid grid-cols-4 gap-2">
                                {subidosSlot.map((a) => <Miniatura key={a.id} a={a} onQuitar={quitar} bloqueado={bloqueado} />)}
                              </div>
                            ) : null}
                            {!bloqueado ? (
                              <BotonSubida
                                etiqueta={s.tipo === "video" ? (subidosSlot.length ? "Subir más vídeos" : "Subir vídeo") : subidosSlot.length ? "Subir más fotos" : "Subir fotos"}
                                accept={s.tipo === "video" ? "video/*,.mov,.mp4,.m4v" : "image/*,.heic,.heif"}
                                coleccionId={col.id}
                                fase={f.fase}
                                slot={s.slot}
                                onSubido={alSubir}
                                onOcupado={alOcupar}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {mios.some((a) => a.tipo_archivo === "video") ? (
              <div className="space-y-2">
                {mios.filter((a) => a.tipo_archivo === "video").map((a) => <FilaVideo key={a.id} a={a} onQuitar={quitar} bloqueado={bloqueado} />)}
              </div>
            ) : null}
            {mios.some((a) => a.tipo_archivo === "foto") ? (
              <div className="grid grid-cols-4 gap-2">
                {mios.filter((a) => a.tipo_archivo === "foto").map((a) => <Miniatura key={a.id} a={a} onQuitar={quitar} bloqueado={bloqueado} />)}
              </div>
            ) : null}
            {!bloqueado ? (
              <BotonSubida
                etiqueta="Subir fotos y vídeos"
                accept="image/*,video/*,.heic,.heif,.mov"
                coleccionId={col.id}
                onSubido={alSubir}
                onOcupado={alOcupar}
              />
            ) : null}
          </div>
        )}

        {!bloqueado ? (
          <button type="button" disabled={ocupadas > 0 || !mios.length} onClick={() => entregar(col)} className="btn-primary h-12 w-full text-base disabled:opacity-40">
            Marcar como entregado
          </button>
        ) : (
          <p className="text-center text-xs text-white/35">
            Entregado el {col.entregado_at ? new Date(col.entregado_at).toLocaleDateString("es-ES") : ""}. Si tienes que cambiar algo, avisa a tu agencia.
          </p>
        )}
        <p className="text-center text-xs text-white/30">Los archivos se suben tal cual, sin perder calidad. No cierres la página mientras suben.</p>
      </section>
    );
  }

  /* ------------------------------------------------- listas ------------------------------------------------- */
  const lista = colecciones.filter((c) => c.tipo === tipo);
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
        {(["script", "pack", "post"] as TipoColeccion[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTipo(t);
              setNuevo(null);
              setAviso(null);
            }}
            className={`min-h-10 rounded-xl text-sm font-semibold transition ${tipo === t ? "bg-[#8B5CF6]/30 text-white" : "text-white/50"}`}
          >
            {ETIQUETA_TIPO[t]} <span className="text-xs opacity-60">{colecciones.filter((c) => c.tipo === t).length || ""}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-white/45">
        {tipo === "script"
          ? "Cada script tiene 8 fases. Sube el vídeo y las fotos de cada fase en su sitio, tal como pide la guía."
          : tipo === "pack"
            ? "Un pack es un conjunto de fotos y vídeos de una misma cosa. Dale un nombre y sube lo que lleve."
            : "Un post es una publicación suelta: ponle un título y sube sus fotos o vídeos."}
      </p>
      {aviso ? <p className={`rounded-xl px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.texto}</p> : null}

      {nuevo ? (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <input
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder={tipo === "pack" ? "Nombre del pack (ej. Ducha)" : "Título del post"}
            maxLength={80}
            className="input-base w-full"
            autoFocus
          />
          <textarea
            value={nuevo.descripcion}
            onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
            placeholder={tipo === "pack" ? "De qué va (opcional)" : "Texto o idea del post (opcional)"}
            rows={2}
            className="input-base w-full resize-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNuevo(null)} className="btn-secondary h-11 flex-1 text-sm">Cancelar</button>
            <button type="button" disabled={creando || !nuevo.nombre.trim()} onClick={crear} className="btn-primary h-11 flex-1 text-sm disabled:opacity-40">
              {creando ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={creando}
          onClick={() => (tipo === "script" ? crear() : setNuevo({ nombre: "", descripcion: "" }))}
          className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-base disabled:opacity-50"
        >
          <Plus className="h-5 w-5" /> {tipo === "script" ? "Empezar un script nuevo" : tipo === "pack" ? "Nuevo pack" : "Nuevo post"}
        </button>
      )}

      {lista.length ? (
        <ul className="space-y-2">
          {lista.map((c) => {
            const mios = delCol(c.id);
            const pr = c.tipo === "script" ? progresoScript(mios) : null;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => { setAbierta(c.id); setFaseAbierta(1); setAviso(null); }} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-left transition hover:bg-white/[0.07]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{c.nombre}</p>
                    <p className="text-xs text-white/40">
                      {pr ? `${pr.fasesCompletas}/8 fases · ${pr.subidos}/${pr.total} archivos` : `${mios.length} archivo${mios.length === 1 ? "" : "s"}`} ·{" "}
                      {new Date(c.created_at).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.estado === "entregado" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
                    {c.estado === "entregado" ? "Entregado" : "En curso"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/40">Todavía no tienes {ETIQUETA_TIPO[tipo].toLowerCase()}.</p>
      )}
    </section>
  );
}
