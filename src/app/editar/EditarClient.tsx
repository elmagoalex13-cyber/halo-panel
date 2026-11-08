"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarModelo } from "@/components/AvatarModelo";
import { SelectorAmbito, ambitoCoincide, type FiltroAmbito } from "@/components/SelectorAmbito";

export type PiezaEditar = {
  id: string;
  archivo: string;
  recibido_at: string;
  size: number | null;
  tipo: string | null;
  preview: { poster: string; video: string } | null;
};
export type ModeloEditar = {
  id: string;
  nombre: string;
  foto: number | null;
  activa: boolean;
  enCaptacion: boolean;
  manual: boolean;
  piezas: PiezaEditar[];
  enEdicion: { pendiente: number; procesando: number; error: number };
};

const NOMBRE_TIPO: Record<string, string> = { tipo1: "Hablado", tipo2: "Frases + música", tipo4: "Con referencia" };
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const mb = (n: number | null) => (n ? `${Math.round(n / 1e6)} MB` : "");

/** Miniatura de un vídeo en espera: su imagen si ya esta lista (si no carga, se ve un marcador) y una casilla para elegirlo. */
function Tarjeta({ p, elegida, onElegir, onVer }: { p: PiezaEditar; elegida: boolean; onElegir: () => void; onVer: () => void }) {
  const [sinImagen, setSinImagen] = useState(false);
  return (
    <li className={`min-w-0 rounded-xl border p-1.5 transition ${elegida ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/[0.1]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-black/50">
        <button type="button" onClick={onVer} className="group absolute inset-0 block w-full" aria-label={`Ver ${p.archivo}`}>
          {p.preview && !sinImagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.preview.poster} alt="" loading="lazy" onError={() => setSinImagen(true)} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center px-2 text-center text-[10px] leading-tight text-white/35">{p.preview ? "Vista previa" : "Preparando vista previa…"}</span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/20 text-xl text-white opacity-70 transition group-hover:opacity-100">▶</span>
        </button>
        <button
          type="button"
          onClick={onElegir}
          aria-label={elegida ? "Quitar de la selección" : "Elegir para editar"}
          aria-pressed={elegida}
          className={`absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg border text-sm font-bold transition ${elegida ? "border-[#8B5CF6] bg-[#8B5CF6] text-white" : "border-white/40 bg-black/60 text-transparent hover:text-white/60"}`}
        >
          ✓
        </button>
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium text-white/80" title={p.archivo}>
        {p.archivo}
      </p>
      <p className="truncate text-[10px] text-white/40">
        {fecha(p.recibido_at)}
        {p.size ? ` · ${mb(p.size)}` : ""}
      </p>
      {p.tipo && NOMBRE_TIPO[p.tipo] ? <p className="mt-0.5 truncate text-[10px] font-semibold text-[#C4B5FD]">{NOMBRE_TIPO[p.tipo]}</p> : null}
    </li>
  );
}

export function EditarClient({ modelos: iniciales, esDueno, ambitos }: { modelos: ModeloEditar[]; esDueno: boolean; ambitos: Record<string, string> }) {
  const router = useRouter();
  const [modelos, setModelos] = useState(iniciales);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [visor, setVisor] = useState<PiezaEditar | null>(null);
  const [verAjustes, setVerAjustes] = useState(false);
  const [filtro, setFiltro] = useState<FiltroAmbito>("todas"); // mis modelos / las que comparto con mi socio

  // Todo lo de la pantalla (contadores, tarjetas y ajustes) se calcula solo con las modelos del filtro elegido
  const delFiltro = useMemo(() => modelos.filter((m) => ambitoCoincide(filtro, ambitos[m.id])), [modelos, filtro, ambitos]);
  const resumen = useMemo(
    () => ({
      espera: delFiltro.reduce((t, m) => t + m.piezas.length, 0),
      enEdicion: delFiltro.reduce((t, m) => t + m.enEdicion.pendiente + m.enEdicion.procesando, 0),
      error: delFiltro.reduce((t, m) => t + m.enEdicion.error, 0),
    }),
    [delFiltro],
  );
  const cambiarFiltro = (f: FiltroAmbito) => {
    setFiltro(f);
    setElegidas(new Set()); // no se queda elegido nada que ya no se ve
  };

  const conVideos = useMemo(() => delFiltro.filter((m) => m.piezas.length).sort((a, b) => b.piezas.length - a.piezas.length || a.nombre.localeCompare(b.nombre, "es")), [delFiltro]);
  const nModelosElegidos = useMemo(() => modelos.filter((m) => m.piezas.some((p) => elegidas.has(p.id))).length, [modelos, elegidas]);
  const sinCaptacion = delFiltro.filter((m) => m.activa && !m.enCaptacion);

  const alternar = (id: string) =>
    setElegidas((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  function elegirModelo(m: ModeloEditar, todas: boolean) {
    setElegidas((p) => {
      const n = new Set(p);
      for (const x of m.piezas) {
        if (todas) n.add(x.id);
        else n.delete(x.id);
      }
      return n;
    });
  }

  async function llamar(cuerpo: Record<string, unknown>) {
    const res = await fetch("/api/editar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; enviados?: number };
    if (!res.ok) throw new Error(j.error ?? "No se pudo hacer");
    return j;
  }

  async function enviar(ids: string[]) {
    if (!ids.length || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const j = await llamar({ accion: "enviar", ids });
      const enviados = new Set(ids);
      setModelos((p) => p.map((m) => ({ ...m, piezas: m.piezas.filter((x) => !enviados.has(x.id)) })));
      setElegidas(new Set());
      setAviso({ ok: true, texto: `${j.enviados} ${j.enviados === 1 ? "vídeo mandado" : "vídeos mandados"} a editar. Cuando estén listos los verás en Aprobación.` });
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo mandar a editar" });
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarModo(ids: string[], manual: boolean, todas = false) {
    const anteriores = modelos;
    setModelos((p) => p.map((m) => (ids.includes(m.id) ? { ...m, manual } : m)));
    try {
      await llamar(todas ? { accion: "modo_todas", manual } : { accion: "modo", modelo_id: ids[0], manual });
    } catch (e) {
      setModelos(anteriores);
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo cambiar" });
    }
  }

  const chip = "rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs";
  return (
    <div className="space-y-5 pb-24">
      <SelectorAmbito esDueno={esDueno} valor={filtro} onChange={cambiarFiltro} cuenta={(f) => modelos.filter((m) => ambitoCoincide(f, ambitos[m.id])).reduce((t, m) => t + m.piezas.length, 0)} />
      <div className="flex flex-wrap gap-2">
        <div className={chip}>
          <span className="font-display text-lg font-semibold text-white">{resumen.espera}</span> <span className="text-white/50">esperando</span>
        </div>
        <div className={chip}>
          <span className="font-display text-lg font-semibold text-white">{resumen.enEdicion}</span> <span className="text-white/50">en edición</span>
        </div>
        <div className={`${chip} ${resumen.error ? "border-red-400/40 bg-red-400/[0.08]" : ""}`}>
          <span className={`font-display text-lg font-semibold ${resumen.error ? "text-red-200" : "text-white"}`}>{resumen.error}</span> <span className="text-white/50">con error</span>
          {resumen.error ? (
            <Link href="/originales" className="ml-2 font-semibold text-[#C4B5FD] underline">
              Ver
            </Link>
          ) : null}
        </div>
      </div>

      {aviso ? <p className={`rounded-xl border px-3 py-2 text-sm ${aviso.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>{aviso.texto}</p> : null}

      {conVideos.length === 0 ? (
        <div className="grid min-h-[26vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/45">
          <div>
            <p className="font-semibold text-white/70">No hay vídeos esperando</p>
            <p className="mt-1 max-w-md">
              Aquí aparecen los vídeos de las modelos que están en captación y los de las que tengan la edición en manual. Puedes cambiarlo abajo, en «Cómo se editan los vídeos de cada modelo».
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {conVideos.map((m) => {
            const suyas = m.piezas.filter((p) => elegidas.has(p.id));
            return (
              <section key={m.id} className="glass-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-9 w-9 text-sm" />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate font-display text-lg font-semibold text-white">{m.nombre}</p>
                    <p className="text-xs text-white/45">
                      {m.piezas.length} {m.piezas.length === 1 ? "vídeo esperando" : "vídeos esperando"} ·{" "}
                      {m.enCaptacion ? "en captación" : m.manual ? "edición manual" : "edición automática"}
                      {m.enEdicion.pendiente + m.enEdicion.procesando ? ` · ${m.enEdicion.pendiente + m.enEdicion.procesando} en edición` : ""}
                      {m.enEdicion.error ? ` · ${m.enEdicion.error} con error` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" onClick={() => elegirModelo(m, suyas.length !== m.piezas.length)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 font-semibold text-white/70 transition hover:text-white">
                      {suyas.length === m.piezas.length ? "Quitar todos" : "Elegir todos"}
                    </button>
                    <button
                      type="button"
                      disabled={!suyas.length || ocupado}
                      onClick={() => void enviar(suyas.map((p) => p.id))}
                      className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 font-semibold text-white transition hover:bg-[#7C3AED] disabled:opacity-35"
                    >
                      ✂ Mandar a editar{suyas.length ? ` (${suyas.length})` : ""}
                    </button>
                  </div>
                </div>
                <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(7.4rem,1fr))] gap-2.5">
                  {m.piezas.map((p) => (
                    <Tarjeta key={p.id} p={p} elegida={elegidas.has(p.id)} onElegir={() => alternar(p.id)} onVer={() => setVisor(p)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <button type="button" onClick={() => setVerAjustes((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={verAjustes}>
          <span>
            <span className="block text-sm font-semibold text-white">Cómo se editan los vídeos de cada modelo</span>
            <span className="block text-xs text-white/45">
              Automática: los vídeos nuevos se editan solos (como hasta ahora). Manual: esperan aquí y tú eliges. Las modelos en captación siempre esperan aquí.
            </span>
          </span>
          <span className="shrink-0 text-white/40">{verAjustes ? "▲" : "▼"}</span>
        </button>
        {verAjustes ? (
          <div className="space-y-2 border-t border-white/[0.08] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-white/45">Para todas a la vez:</span>
              <button type="button" onClick={() => void cambiarModo(sinCaptacion.map((m) => m.id), true, true)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 font-semibold text-white/70 transition hover:text-white">
                Todas en manual
              </button>
              <button type="button" onClick={() => void cambiarModo(sinCaptacion.map((m) => m.id), false, true)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 font-semibold text-white/70 transition hover:text-white">
                Todas en automática
              </button>
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {delFiltro
                .filter((m) => m.activa)
                .map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
                    <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-7 w-7 text-xs" />
                    <span className="min-w-0 flex-1 basis-32 truncate text-sm text-white/85">{m.nombre}</span>
                    {m.enCaptacion ? (
                      <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200">En captación: sus vídeos esperan aquí</span>
                    ) : (
                      <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-xs font-semibold" role="group" aria-label={`Edición de ${m.nombre}`}>
                        <button type="button" onClick={() => !m.manual || void cambiarModo([m.id], false)} className={`rounded-md px-3 py-1 transition ${!m.manual ? "bg-[#8B5CF6] text-white" : "text-white/50 hover:text-white"}`} aria-pressed={!m.manual}>
                          Automática
                        </button>
                        <button type="button" onClick={() => m.manual || void cambiarModo([m.id], true)} className={`rounded-md px-3 py-1 transition ${m.manual ? "bg-[#8B5CF6] text-white" : "text-white/50 hover:text-white"}`} aria-pressed={m.manual}>
                          Manual
                        </button>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </section>

      {elegidas.size ? (
        <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-3 md:bottom-4 md:left-[var(--sidebar-w,16rem)]">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#8B5CF6]/40 bg-[#14111f] px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]">
            <span className="text-sm text-white">
              <b>{elegidas.size}</b> {elegidas.size === 1 ? "vídeo elegido" : "vídeos elegidos"}
              {nModelosElegidos > 1 ? ` de ${nModelosElegidos} modelos` : ""}
            </span>
            <button type="button" disabled={ocupado} onClick={() => void enviar([...elegidas])} className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:opacity-40">
              {ocupado ? "Mandando…" : "✂ Mandar a editar"}
            </button>
            <button type="button" onClick={() => setElegidas(new Set())} className="text-xs font-semibold text-white/50 transition hover:text-white">
              Quitar selección
            </button>
          </div>
        </div>
      ) : null}

      {visor && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4" role="dialog" aria-modal="true" onClick={() => setVisor(null)}>
              <div className="w-full max-w-sm rounded-2xl bg-[#14111f] p-3" onClick={(e) => e.stopPropagation()}>
                {visor.preview ? (
                  <video src={visor.preview.video} poster={visor.preview.poster} controls autoPlay playsInline className="aspect-[9/16] w-full rounded-xl bg-black object-contain" />
                ) : (
                  <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-black px-6 text-center text-sm text-white/50">La vista previa se está preparando. Vuelve a abrirlo en un par de minutos.</div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-white/60">{visor.archivo}</span>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => alternar(visor.id)} className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-xs font-semibold text-white">
                      {elegidas.has(visor.id) ? "Quitar" : "Elegir"}
                    </button>
                    <button type="button" onClick={() => setVisor(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70">
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
