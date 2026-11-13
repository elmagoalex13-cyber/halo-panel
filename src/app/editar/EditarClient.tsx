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
  nuevo: boolean; // llego despues de la ultima vez que lo marcaste como visto
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
      {p.nuevo ? <span className="mb-0.5 mt-1.5 inline-block rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-black">NUEVO</span> : null}
      <p className={`${p.nuevo ? "" : "mt-1.5 "}truncate text-[11px] font-medium text-white/80`} title={p.archivo}>
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
  const [trial, setTrial] = useState<{ ids: string[]; cantidad: number } | null>(null); // ventana «Crear trial reels»

  // Todo lo de la pantalla (contadores, tarjetas y ajustes) se calcula solo con las modelos del filtro elegido
  const delFiltro = useMemo(() => modelos.filter((m) => ambitoCoincide(filtro, ambitos[m.id])), [modelos, filtro, ambitos]);
  const nuevos = useMemo(() => delFiltro.reduce((t, m) => t + m.piezas.filter((p) => p.nuevo).length, 0), [delFiltro]);
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

  // Desplegar / plegar cada modelo: con pocas modelos salen abiertas; con muchas, plegadas (lo que cambies tu se respeta)
  const [aperturas, setAperturas] = useState<Record<string, boolean>>({});
  const abiertaPorDefecto = conVideos.length <= 3;
  const estaAbierta = (id: string) => aperturas[id] ?? abiertaPorDefecto;
  const alternarApertura = (id: string) => setAperturas((p) => ({ ...p, [id]: !(p[id] ?? abiertaPorDefecto) }));
  const abrirTodas = (abrir: boolean) => setAperturas(Object.fromEntries(conVideos.map((m) => [m.id, abrir])));

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
    const j = (await res.json().catch(() => ({}))) as { error?: string; enviados?: number; sinCuenta?: number; sinCuentaIds?: string[] };
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

  // «Crear trial reels»: se editan como siempre y, al terminar, salen en Trial reels con sus versiones (no pasan por Aprobacion)
  async function crearTrial(ids: string[], cantidad: number) {
    if (!ids.length || ocupado) return;
    setTrial(null);
    setOcupado(true);
    setAviso(null);
    try {
      const j = await llamar({ accion: "trial", ids, cantidad });
      const enviados = new Set(ids);
      const quedan = new Set(j.sinCuentaIds ?? []); // los que no se han podido mandar siguen esperando
      setModelos((p) => p.map((m) => ({ ...m, piezas: m.piezas.filter((x) => !enviados.has(x.id) || quedan.has(x.id)) })));
      setElegidas(new Set());
      setAviso({
        ok: true,
        texto: `${j.enviados} ${j.enviados === 1 ? "vídeo mandado" : "vídeos mandados"} a editar para trial reels (${cantidad} ${cantidad === 1 ? "versión" : "versiones"} de cada uno). Cuando estén editados, saldrán en Trial reels.${j.sinCuenta ? ` ${j.sinCuenta} no se han mandado porque su modelo no tiene cuenta de Instagram activa.` : ""}`,
      });
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo crear" });
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

  // «Marcar como vistos»: el numero del menu deja de contar lo que ya has visto (y los NUEVO se quitan); lo que suban despues vuelve a contar
  async function marcarVistos() {
    try {
      await llamar({ accion: "vistos" });
      setModelos((p) => p.map((m) => ({ ...m, piezas: m.piezas.map((x) => ({ ...x, nuevo: false })) })));
      window.dispatchEvent(new Event("halo:contadores"));
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo marcar" });
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
        {nuevos > 0 ? (
          <button type="button" onClick={() => void marcarVistos()} className="rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/25">
            ✓ Marcar como vistos ({nuevos} {nuevos === 1 ? "nuevo" : "nuevos"})
          </button>
        ) : null}
        {conVideos.length > 1 ? (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <button type="button" onClick={() => abrirTodas(true)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-semibold text-white/70 transition hover:text-white">
              Desplegar todas
            </button>
            <button type="button" onClick={() => abrirTodas(false)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-semibold text-white/70 transition hover:text-white">
              Plegar todas
            </button>
          </div>
        ) : null}
      </div>

      {aviso ? <p className={`rounded-xl border px-3 py-2 text-sm ${aviso.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>{aviso.texto}</p> : null}

      {conVideos.length === 0 ? (
        <div className="grid min-h-[26vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/45">
          <div>
            <p className="font-semibold text-white/70">No hay vídeos esperando</p>
            <p className="mt-1 max-w-md">
              Aquí aparecen todos los vídeos que suben las modelos y esperan a que tú elijas cuáles editar. Cuando suban uno nuevo, también te avisa un número en el menú.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {conVideos.map((m) => {
            const suyas = m.piezas.filter((p) => elegidas.has(p.id));
            const abierta = estaAbierta(m.id);
            return (
              <section key={m.id} className="glass-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => alternarApertura(m.id)} aria-expanded={abierta} className="flex min-w-0 flex-1 basis-48 items-center gap-3 text-left">
                    <span className={`shrink-0 text-xs text-white/40 transition-transform ${abierta ? "rotate-90" : ""}`} aria-hidden="true">
                      ▶
                    </span>
                    <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-9 w-9 text-sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-semibold text-white">{m.nombre}</span>
                      <span className="block text-xs text-white/45">
                        {m.piezas.length} {m.piezas.length === 1 ? "vídeo esperando" : "vídeos esperando"}
                        {m.piezas.some((p) => p.nuevo) ? ` · ${m.piezas.filter((p) => p.nuevo).length} nuevos` : ""}
                        {suyas.length ? ` · ${suyas.length} elegidos` : ""} · {m.enCaptacion ? "en captación" : m.manual ? "edición manual" : "edición automática"}
                        {m.enEdicion.pendiente + m.enEdicion.procesando ? ` · ${m.enEdicion.pendiente + m.enEdicion.procesando} en edición` : ""}
                        {m.enEdicion.error ? ` · ${m.enEdicion.error} con error` : ""}
                      </span>
                    </span>
                  </button>
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
                    <button
                      type="button"
                      disabled={!suyas.length || ocupado}
                      onClick={() => setTrial({ ids: suyas.map((p) => p.id), cantidad: 3 })}
                      title="Editarlos y crear sus versiones de trial reels"
                      className="rounded-lg border border-[#06B6D4]/50 bg-[#06B6D4]/10 px-3 py-1.5 font-semibold text-cyan-100 transition hover:bg-[#06B6D4]/20 disabled:opacity-35"
                    >
                      🧪 Crear trial reels{suyas.length ? ` (${suyas.length})` : ""}
                    </button>
                  </div>
                </div>
                {abierta ? (
                  <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(7.4rem,1fr))] gap-2.5">
                    {m.piezas.map((p) => (
                      <Tarjeta key={p.id} p={p} elegida={elegidas.has(p.id)} onElegir={() => alternar(p.id)} onVer={() => setVisor(p)} />
                    ))}
                  </ul>
                ) : null}
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
              Manual (lo normal): los vídeos esperan aquí y tú eliges cuáles editar. Automática: los vídeos nuevos de esa modelo se editan solos, sin pasar por aquí. Las modelos en captación siempre esperan aquí.
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
            <button type="button" disabled={ocupado} onClick={() => setTrial({ ids: [...elegidas], cantidad: 3 })} className="rounded-lg border border-[#06B6D4]/50 bg-[#06B6D4]/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-[#06B6D4]/20 disabled:opacity-40">
              🧪 Crear trial reels
            </button>
            <button type="button" onClick={() => setElegidas(new Set())} className="text-xs font-semibold text-white/50 transition hover:text-white">
              Quitar selección
            </button>
          </div>
        </div>
      ) : null}

      {trial ? (
        <div className="sin-blur fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <div className="glass-card w-full max-w-md p-5">
            <p className="font-display text-lg font-semibold text-white">
              Crear trial reels de {trial.ids.length} {trial.ids.length === 1 ? "vídeo" : "vídeos"}
            </p>
            <p className="mt-2 text-sm text-white/55">
              Se editan como siempre (subtítulos, recorte…) y, cuando estén listos, se generan solas las versiones de trial de cada uno. Las verás en <b className="text-white/80">Trial reels</b>, listas para descargar y programar. No pasan por Aprobación.
            </p>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">Versiones de cada vídeo</p>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={trial.cantidad === n}
                  onClick={() => setTrial((t) => (t ? { ...t, cantidad: n } : t))}
                  className={`h-10 w-12 rounded-xl border text-sm font-bold transition ${trial.cantidad === n ? "border-[#06B6D4] bg-[#06B6D4]/25 text-cyan-50" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setTrial(null)} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07]">
                Cancelar
              </button>
              <button type="button" disabled={ocupado} onClick={() => void crearTrial(trial.ids, trial.cantidad)} className="rounded-xl bg-[#06B6D4] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#22D3EE] disabled:opacity-40">
                🧪 Crear con {trial.cantidad} {trial.cantidad === 1 ? "versión" : "versiones"}
              </button>
            </div>
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
