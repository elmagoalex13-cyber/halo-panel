"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PiezaEnEspera } from "@/lib/captacionPiezas";
import type { ProgresoCaptacion } from "@/lib/captacion";

const NOMBRE_TIPO: Record<number, string> = { 1: "Hablado", 2: "Frases + música", 3: "TikTok (no cuenta como reel)", 4: "Con referencia" };
const mb = (b: number | null) => (b ? `${Math.round(b / 1e6)} MB` : "");

function Tarjeta({
  p,
  modeloId,
  elegida,
  onElegir,
  onAmpliar,
  onEliminar,
}: {
  p: PiezaEnEspera;
  modeloId: string;
  elegida: boolean;
  onElegir: () => void;
  onAmpliar: () => void;
  onEliminar: () => void;
}) {
  const [tipo, setTipo] = useState<"bien" | "mejorar" | null>(p.feedback_tipo);
  const [texto, setTexto] = useState(p.feedback_texto ?? "");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);

  async function guardar(nuevoTipo: "bien" | "mejorar" | null, nuevoTexto: string) {
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieza_id: p.id, tipo: nuevoTipo, texto: nuevoTexto }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { telegram?: boolean };
        setTipo(nuevoTipo);
        setSucio(false);
        setMsg(
          !nuevoTipo
            ? "Feedback quitado"
            : nuevoTipo === "mejorar"
              ? !nuevoTexto.trim()
                ? "Escribe qué debe cambiar y pulsa Guardar: entonces se le envía"
                : j.telegram
                  ? "Guardado: en un minuto le llega su vídeo por Telegram con tu comentario y se retira de aquí. Cuando suba otro, lo revisas como uno más"
                  : "Guardado: lo ve en su portal. No tiene Telegram activado, así que el vídeo se queda aquí (elimínalo tú si quieres)"
              : j.telegram
                ? "Guardado: le llega el vídeo por Telegram con tu comentario (en un minuto)"
                : "Guardado: lo ve en su portal (no tiene Telegram activado)",
        );
      } else setMsg(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className={`rounded-2xl border p-3 transition ${elegida ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/[0.07]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative mx-auto aspect-[9/16] w-40 shrink-0 overflow-hidden rounded-xl bg-black/40 sm:mx-0">
          {p.preview ? (
            <>
              <video src={p.preview.video} poster={p.preview.poster} controls preload="none" playsInline className="h-full w-full object-contain" />
              <button type="button" onClick={onAmpliar} title="Ver en grande" aria-label="Ver en grande" className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-sm text-white backdrop-blur transition hover:bg-black/85">
                ⤢
              </button>
            </>
          ) : (
            <div className="grid h-full place-items-center p-3 text-center text-xs text-white/40">Preparando la vista previa… (unos minutos)</div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-white">
              <input type="checkbox" checked={elegida} onChange={onElegir} className="h-5 w-5 accent-[#8B5CF6]" />
              <span className="truncate">{p.archivo ?? p.titulo ?? "Reel"}</span>
            </label>
          </div>
          <p className="text-xs text-white/40">
            {p.tipo ? NOMBRE_TIPO[p.tipo] ?? "" : ""} · subido {new Date(p.recibido_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {p.size_bytes ? ` · ${mb(p.size_bytes)}` : ""} ·{" "}
            <a href={`/api/descargar?id=${p.id}&tipo=original`} className="font-semibold text-[#A78BFA] hover:underline">
              descargar original
            </a>{" "}
            ·{" "}
            <button type="button" onClick={onEliminar} className="font-semibold text-red-300 hover:underline">
              eliminar
            </button>
          </p>

          <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Feedback para la modelo <span className="font-normal normal-case tracking-normal text-white/30">· le llega el vídeo por Telegram con tu comentario; si es «Mejorar», se retira de aquí</span></p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardar(tipo === "bien" ? null : "bien", tipo === "bien" ? "" : texto)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${tipo === "bien" ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/10 text-white/55 hover:text-white"}`}
              >
                ✅ Va bien
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardar(tipo === "mejorar" ? null : "mejorar", tipo === "mejorar" ? "" : texto)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${tipo === "mejorar" ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/10 text-white/55 hover:text-white"}`}
              >
                ⚠️ Mejorar
              </button>
            </div>
            {tipo ? (
              <div className="flex gap-2">
                <input
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setSucio(true);
                  }}
                  placeholder={tipo === "mejorar" ? "Qué debe cambiar (ej.: más luz, hablar más despacio)" : "Comentario (opcional)"}
                  maxLength={600}
                  className="input-base h-9 flex-1 text-sm"
                />
                <button type="button" disabled={guardando || !sucio} onClick={() => void guardar(tipo, texto)} className="btn-secondary px-3 text-xs disabled:opacity-40">
                  Guardar
                </button>
              </div>
            ) : null}
            {msg ? <p className="text-xs text-white/50">{msg}</p> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Revisión de los reels EN ESPERA de una modelo en captación: ver, dar feedback y mandar a editar los que se quiera (o todos). */
export function CaptacionRevision({
  modeloId,
  nombre,
  objetivo,
  subidos,
  enEdicion,
  terminada,
  piezas,
  progreso,
}: {
  progreso: ProgresoCaptacion | null;
  modeloId: string;
  nombre: string;
  objetivo: number;
  subidos: number;
  enEdicion: number;
  terminada: boolean;
  piezas: PiezaEnEspera[];
}) {
  const router = useRouter();
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [grande, setGrande] = useState<number | null>(null); // reel abierto a pantalla grande (indice entre los que tienen vista previa)
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = Math.min(100, Math.round((subidos / objetivo) * 100));

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function mandar(cuerpo: { ids?: string[]; todos?: boolean }, aviso: string) {
    if (!window.confirm(aviso)) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/lote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      if (res.ok) {
        setElegidas(new Set());
        router.refresh();
      } else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo mandar a edición");
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar(ids: string[]) {
    if (!ids.length) return;
    const motivo = window.prompt(
      `Vas a eliminar ${ids.length} reel${ids.length === 1 ? "" : "s"} de ${nombre}: se borra el vídeo para siempre y deja de contar entre sus reels subidos (tendrá que grabar otro).

Si quieres, escribe aquí por qué (se lo mandamos por Telegram). Déjalo vacío para eliminar sin motivo. Cancelar = no eliminar.`,
      "",
    );
    if (motivo === null) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/descartar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, motivo }) });
      if (res.ok) {
        setElegidas(new Set());
        router.refresh();
      } else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo eliminar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      {progreso ? (
        <div className={`rounded-2xl border p-4 ${progreso.cumplido ? "border-cyan-400/40 bg-cyan-400/[0.07]" : "border-white/10 bg-white/[0.03]"}`}>
          <p className="text-sm font-semibold text-white">
            Mínimos para crear su cuenta de Instagram {progreso.cumplido ? <span className="text-cyan-200">· ¡todo cumplido!</span> : null}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Reels subidos", progreso.reels, null],
                ["Scripts completos y aprobados", progreso.scripts, `${progreso.scriptsEntregados} entregados`],
                ["Packs de fotos", progreso.packs, null],
                ["Posts de OnlyFans", progreso.posts, null],
              ] as const
            )
              .filter(([, m]) => m.obj !== null)
              .map(([nombre, m, extra]) => {
                const obj = m.obj as number;
                const hecho = m.n >= obj;
                return (
                  <div key={nombre} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                    <p className="text-xs text-white/50">{nombre}</p>
                    <p className={`mt-0.5 font-display text-xl font-semibold ${hecho ? "text-emerald-300" : "text-white"}`}>
                      {m.n}/{obj}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${hecho ? "bg-emerald-400" : "bg-[#8B5CF6]"}`} style={{ width: `${Math.min(100, Math.round((m.n / obj) * 100))}%` }} />
                    </div>
                    {extra && !hecho ? <p className="mt-1 text-[11px] text-white/35">{extra}</p> : null}
                  </div>
                );
              })}
          </div>
          <p className="mt-3 text-xs text-white/40">
            Los scripts solo cuentan cuando los <span className="text-white/70">apruebas</span> en <Link href="/onlyfans" className="font-semibold text-[#A78BFA] hover:underline">OnlyFans</Link>; los packs y posts, cuando la modelo los entrega.
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-white">
            {nombre} · {subidos}/{objetivo} reels subidos
          </span>
          <span className="text-white/50">
            {piezas.filter((p) => p.tipo !== 3).length} reels en espera de revisión{piezas.some((p) => p.tipo === 3) ? ` + ${piezas.filter((p) => p.tipo === 3).length} TikTok guardados` : ""} · {enEdicion} ya enviados a edición{terminada ? " · captación terminada" : ""}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${subidos >= objetivo ? "bg-cyan-400" : "bg-[#8B5CF6]"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          Estos reels <span className="text-white/70">no se editan</span> hasta que los mandéis. Revisadlos, dad feedback a la modelo (lo ve en su portal) y mandad a editar los que queráis: 5, 10 o todos.
          Si mandáis solo algunos, lo que ella suba después seguirá quedándose aquí para revisarlo. Con «Mandar todos» se termina la captación y lo siguiente se edita directamente.
        </p>
      </div>

      {piezas.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/45">
          {terminada ? "La captación ya terminó: lo que sube la modelo se edita directamente." : "Todavía no hay reels en espera. Cuando la modelo suba, aparecerán aquí."}
        </p>
      ) : (
        <>
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0d0a16]/90 p-3 backdrop-blur-xl">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={elegidas.size === piezas.length}
                onChange={() => setElegidas(elegidas.size === piezas.length ? new Set() : new Set(piezas.map((p) => p.id)))}
                className="h-4 w-4 accent-[#8B5CF6]"
              />
              Elegir todos ({piezas.length})
            </label>
            <span className="text-xs text-white/40">{elegidas.size} elegidos</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={enviando || elegidas.size === 0}
                onClick={() => void mandar({ ids: [...elegidas] }, `¿Mandar a edición ${elegidas.size} reel${elegidas.size === 1 ? "" : "s"} de ${nombre}? La captación sigue abierta: lo que suba después seguirá quedando en espera.`)}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
              >
                {enviando ? "Enviando…" : `Mandar ${elegidas.size || ""} a editar`.replace("  ", " ")}
              </button>
              <button
                type="button"
                disabled={enviando || elegidas.size === 0}
                onClick={() => void eliminar([...elegidas])}
                className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-950/70 disabled:opacity-40"
              >
                {`Eliminar ${elegidas.size || ""}`.trim()}
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => void mandar({ todos: true }, `¿Mandar TODOS los ${piezas.length} reels de ${nombre} a edición y terminar la captación? Desde ahora, lo que suba se editará directamente.`)}
                className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-40"
              >
                Mandar todos ({piezas.length}) y terminar captación
              </button>
            </div>
          </div>
          {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
          <ul className="space-y-3">
            {piezas.map((p) => (
              <Tarjeta key={p.id} p={p} modeloId={modeloId} elegida={elegidas.has(p.id)} onElegir={() => alternar(p.id)} onAmpliar={() => setGrande(piezas.filter((x) => x.preview).findIndex((x) => x.id === p.id))} onEliminar={() => void eliminar([p.id])} />
            ))}
          </ul>
          {grande !== null ? <VisorReels piezas={piezas.filter((x) => x.preview)} indice={grande} onCambiar={setGrande} onCerrar={() => setGrande(null)} /> : null}
        </>
      )}
    </div>
  );
}


/** Los reels en espera a pantalla grande, dentro de la app: flechas (o ← →) para pasar de uno a otro, Esc o clic fuera para cerrar. */
function VisorReels({ piezas, indice, onCambiar, onCerrar }: { piezas: PiezaEnEspera[]; indice: number; onCambiar: (i: number) => void; onCerrar: () => void }) {
  const p = piezas[indice];
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowLeft" && piezas.length > 1) onCambiar((indice - 1 + piezas.length) % piezas.length);
      if (e.key === "ArrowRight" && piezas.length > 1) onCambiar((indice + 1) % piezas.length);
    };
    window.addEventListener("keydown", t);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", t);
      document.body.style.overflow = overflow;
    };
  }, [indice, piezas.length, onCambiar, onCerrar]);
  if (!p?.preview) return null;
  const flecha = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/25";
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate">
          {indice + 1} / {piezas.length} · {p.archivo ?? p.titulo ?? "Reel"}
        </span>
        <div className="flex items-center gap-2">
          <a href={`/api/descargar?id=${p.id}&tipo=original`} className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/25">Descargar original</a>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25">✕</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3 pb-4">
        {piezas.length > 1 ? <button type="button" onClick={(e) => { e.stopPropagation(); onCambiar((indice - 1 + piezas.length) % piezas.length); }} className={flecha} aria-label="Anterior">‹</button> : null}
        <video key={p.id} src={p.preview.video} poster={p.preview.poster} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="max-h-full min-h-0 max-w-full rounded-xl bg-black object-contain" style={{ height: "100%", aspectRatio: "9 / 16" }} />
        {piezas.length > 1 ? <button type="button" onClick={(e) => { e.stopPropagation(); onCambiar((indice + 1) % piezas.length); }} className={flecha} aria-label="Siguiente">›</button> : null}
      </div>
    </div>
  );
}
