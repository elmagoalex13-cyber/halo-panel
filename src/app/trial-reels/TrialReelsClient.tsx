"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarModelo } from "@/components/AvatarModelo";
import { SelectorAmbito, ambitoCoincide, type FiltroAmbito } from "@/components/SelectorAmbito";
import { compacto } from "@/lib/viral";
import type { ViralPropio } from "@/app/instagram/ViralesPropiosTab";
import type { PedidoVista } from "@/lib/trialReelsManual";

type Mostrar = "todos" | "sin_generar" | "generando" | "listos";

const ETIQUETA_ESTADO: Record<ViralPropio["estado"], string> = { pendiente: "Por revisar", aprobado: "Aprobado", subido: "Subido a trial", descartado: "Descartado" };

function urlVideo(key: string | null) {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return key && base ? `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}` : null;
}
const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

export function TrialReelsClient({ virales: todos, pedidos: iniciales, esDueno, ambitos }: { virales: ViralPropio[]; pedidos: PedidoVista[]; esDueno: boolean; ambitos: Record<string, string> }) {
  const [pedidos, setPedidos] = useState(iniciales);
  const [filtroAmbito, setFiltroAmbito] = useState<FiltroAmbito>("todas");
  const [modelo, setModelo] = useState("todas");
  const [mostrar, setMostrar] = useState<Mostrar>("todos");
  const [conDescartados, setConDescartados] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [original, setOriginal] = useState<string | null>(null);

  const virales = useMemo(() => todos.filter((v) => ambitoCoincide(filtroAmbito, v.modelo_id ? ambitos[v.modelo_id] : null)), [todos, filtroAmbito, ambitos]);
  const modelos = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of virales) if (v.modelo_id && v.modelo_nombre) m.set(v.modelo_id, v.modelo_nombre);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [virales]);

  const porViral = useMemo(() => {
    const m = new Map<string, PedidoVista[]>();
    for (const p of pedidos) m.set(p.viral_id, [...(m.get(p.viral_id) ?? []), p]);
    for (const l of m.values()) l.sort((a, b) => b.at.localeCompare(a.at));
    return m;
  }, [pedidos]);
  const enMarcha = useCallback((id: string) => (porViral.get(id) ?? []).some((p) => p.estado === "pendiente" || p.estado === "procesando"), [porViral]);
  const tieneListos = useCallback((id: string) => (porViral.get(id) ?? []).some((p) => p.estado === "listo"), [porViral]);

  const visibles = useMemo(
    () =>
      virales
        .filter((v) => (conDescartados ? true : v.estado !== "descartado"))
        .filter((v) => modelo === "todas" || v.modelo_id === modelo)
        .filter((v) => {
          if (mostrar === "sin_generar") return !(porViral.get(v.id) ?? []).length;
          if (mostrar === "generando") return enMarcha(v.id);
          if (mostrar === "listos") return tieneListos(v.id);
          return true;
        })
        .sort((a, b) => new Date(b.fecha_publicacion ?? 0).getTime() - new Date(a.fecha_publicacion ?? 0).getTime()),
    [virales, conDescartados, modelo, mostrar, porViral, enMarcha, tieneListos],
  );
  const sinGenerar = visibles.filter((v) => !(porViral.get(v.id) ?? []).length);
  const hayEnMarcha = pedidos.some((p) => p.estado === "pendiente" || p.estado === "procesando");

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch("/api/trial-reels/manual", { cache: "no-store" });
      if (res.ok) setPedidos(((await res.json()) as { pedidos: PedidoVista[] }).pedidos);
    } catch {
      /* se reintenta en el siguiente ciclo */
    }
  }, []);
  // Mientras se generan, se mira el avance cada pocos segundos
  useEffect(() => {
    if (!hayEnMarcha) return;
    const t = setInterval(() => void refrescar(), 6000);
    return () => clearInterval(t);
  }, [hayEnMarcha, refrescar]);

  async function llamar(clave: string, init: RequestInit, url = "/api/trial-reels/manual") {
    setOcupado(clave);
    setAviso(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const j = (await res.json().catch(() => ({}))) as { error?: string; pedidos?: PedidoVista[]; nuevos?: number };
      if (!res.ok) throw new Error(j.error ?? "No se pudo hacer");
      if (j.pedidos) setPedidos(j.pedidos);
      return j;
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo hacer" });
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function generar(ids: string[]) {
    const j = await llamar(ids.length === 1 ? ids[0] : "lote", { method: "POST", body: JSON.stringify({ accion: "generar", viral_ids: ids }) });
    if (j) setAviso({ ok: true, texto: `${j.nuevos ?? ids.length} ${j.nuevos === 1 ? "vídeo en cola" : "vídeos en cola"}: en unos minutos tendrás sus 3 versiones aquí.` });
  }
  const programado = (p: PedidoVista, n: number, valor: boolean) => void llamar(`${p.id}-${n}`, { method: "POST", body: JSON.stringify({ accion: "programado", pedido_id: p.id, n, valor }) });
  function borrar(p: PedidoVista) {
    if (!window.confirm("¿Borrar estas 3 versiones? Se borran los archivos para siempre.")) return;
    void llamar(p.id, { method: "DELETE" }, `/api/trial-reels/manual?id=${p.id}`);
  }

  const chip = (a: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${a ? "bg-[#8B5CF6] text-white" : "bg-white/[0.05] text-white/50 hover:text-white/80"}`;

  return (
    <div className="space-y-4">
      <SelectorAmbito esDueno={esDueno} valor={filtroAmbito} onChange={setFiltroAmbito} cuenta={(f) => todos.filter((v) => ambitoCoincide(f, v.modelo_id ? ambitos[v.modelo_id] : null)).length} />

      <div className="flex flex-wrap items-center gap-2">
        {([["todos", "Todos"], ["sin_generar", "Sin generar"], ["generando", "Generando"], ["listos", "Listos"]] as Array<[Mostrar, string]>).map(([id, texto]) => (
          <button key={id} onClick={() => setMostrar(id)} className={chip(mostrar === id)}>
            {texto}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-white/50">
            <input type="checkbox" checked={conDescartados} onChange={(e) => setConDescartados(e.target.checked)} className="accent-[#8B5CF6]" /> Incluir descartados
          </label>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="input-base py-1.5 text-xs">
            <option value="todas">Todas las modelos</option>
            {modelos.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sinGenerar.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2 text-xs">
          <button
            disabled={ocupado !== null}
            onClick={() => void generar(sinGenerar.map((v) => v.id).slice(0, 100))}
            className="rounded-lg bg-emerald-500/20 px-3 py-1.5 font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-40"
          >
            ⚡ Generar 3 reels para los {Math.min(sinGenerar.length, 100)} vídeos sin generar
          </button>
          <span className="text-white/35">Se hacen de uno en uno (cada vídeo tarda un par de minutos).</span>
        </div>
      ) : null}
      {aviso ? <p className={`rounded-xl border px-3 py-2 text-xs ${aviso.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>{aviso.texto}</p> : null}

      {visibles.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {todos.length === 0 ? "Todavía no hay vídeos virales de tus modelos. Búscalos en Instagram → Virales propios." : "Nada con esos filtros."}
        </div>
      ) : (
        <div className="space-y-4">
          {visibles.map((v) => {
            const lista = porViral.get(v.id) ?? [];
            const src = urlVideo(v.video_key);
            return (
              <article key={v.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <AvatarModelo id={v.modelo_id ?? v.id} nombre={v.modelo_nombre || v.username} foto={v.foto} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">@{v.username} <span className="font-normal text-white/40">· {v.modelo_nombre}</span></p>
                    <p className="text-xs text-white/40">
                      {compacto(v.vistas)} visitas · {compacto(v.likes)} likes · {ETIQUETA_ESTADO[v.estado]}
                      {v.fecha_publicacion ? ` · ${new Date(v.fecha_publicacion).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}` : ""}
                    </p>
                  </div>
                  {src ? (
                    <button onClick={() => setOriginal(src)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:text-white">
                      Ver original
                    </button>
                  ) : null}
                  <button
                    disabled={ocupado !== null || enMarcha(v.id) || !v.video_key}
                    onClick={() => void generar([v.id])}
                    className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#7C3AED] disabled:opacity-40"
                  >
                    {enMarcha(v.id) ? "Generando…" : lista.some((p) => p.estado === "listo") ? "Generar otras 3" : "Generar 3 reels"}
                  </button>
                </div>

                {lista.map((p) => (
                  <div key={p.id} className="mt-3 space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-white/45">Pedido el {fecha(p.at)}{p.por ? ` · ${p.por}` : ""}</span>
                      {p.estado === "pendiente" ? <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white/60">En cola</span> : null}
                      {p.estado === "procesando" ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">Generando… {p.variantes.length}/3</span> : null}
                      {p.estado === "error" ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-300">Error</span> : null}
                      <button disabled={ocupado !== null || p.estado === "procesando"} onClick={() => borrar(p)} className="ml-auto text-white/35 transition hover:text-red-300 disabled:opacity-30">
                        Borrar tanda
                      </button>
                    </div>
                    {p.estado === "error" ? <p className="text-xs text-red-300">{p.error ?? "No se pudo generar."} Pulsa «Borrar tanda» y vuelve a generar.</p> : null}
                    {p.variantes.length ? (
                      <div className="grid grid-cols-3 gap-3">
                        {p.variantes.map((x) => (
                          <div key={x.n} className="space-y-1.5">
                            <div className="aspect-[9/16] overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
                              {x.vista ? <video src={x.vista} controls playsInline preload="metadata" className="h-full w-full object-contain" /> : null}
                            </div>
                            <p className="text-[11px] font-semibold text-white/80">Versión {x.n}</p>
                            <p className="text-[10px] leading-snug text-white/35">{x.resumen.join(" · ")}</p>
                            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                              <a href={x.descarga} className="rounded-lg bg-[#8B5CF6]/25 px-2 py-1 text-[#c4b5fd] transition hover:bg-[#8B5CF6]/35">Descargar</a>
                              <button
                                disabled={ocupado !== null}
                                onClick={() => programado(p, x.n, !x.programado_at)}
                                title={x.programado_at ? `Programado el ${fecha(x.programado_at)}${x.programado_por ? ` (${x.programado_por})` : ""}` : "Márcalo cuando lo hayas programado"}
                                className={`rounded-lg border px-2 py-1 transition disabled:opacity-40 ${x.programado_at ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-white/[0.04] text-white/55 hover:text-white"}`}
                              >
                                {x.programado_at ? "✓ Programado" : "Marcar programado"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      )}

      {original ? <VisorVideo src={original} onCerrar={() => setOriginal(null)} /> : null}
    </div>
  );
}

function VisorVideo({ src, onCerrar }: { src: string; onCerrar: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="relative max-h-full w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <video src={src} controls autoPlay playsInline className="max-h-[85vh] w-full rounded-xl bg-black object-contain" />
        <button onClick={onCerrar} aria-label="Cerrar" className="absolute -top-3 -right-3 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white">✕</button>
      </div>
    </div>
  );
}

