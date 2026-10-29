"use client";

import { useState } from "react";
import { estadoFase, type FeedbackFase } from "@/lib/feedbackFasesTipos";

/**
 * Feedback de la agencia sobre UNA fase de un script. La modelo lo ve dentro de esa fase en su portal y le llega por Telegram
 * (agrupado: un solo mensaje por script). «Mejorar» necesita el comentario; el aviso sale cuando lo envias.
 */
export function FeedbackFaseAgencia({
  coleccionId,
  fase,
  inicial,
  archivosFase,
}: {
  coleccionId: string;
  fase: number;
  inicial: FeedbackFase | null;
  archivosFase: Array<{ created_at: string }>;
}) {
  const [fb, setFb] = useState<FeedbackFase | null>(inicial);
  const [tipo, setTipo] = useState<"bien" | "mejorar" | null>(inicial?.tipo ?? null);
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const estado = estadoFase(fb ?? undefined, archivosFase);

  async function guardar(nuevoTipo: "bien" | "mejorar" | null, nuevoTexto: string) {
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/onlyfans/feedback-fase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coleccion_id: coleccionId, fase, tipo: nuevoTipo, texto: nuevoTexto }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; telegram?: boolean };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
      setTipo(nuevoTipo);
      setSucio(false);
      setFb(nuevoTipo ? { tipo: nuevoTipo, texto: nuevoTexto.trim(), at: new Date().toISOString(), por: "" } : null);
      if (!nuevoTipo) setMsg({ ok: true, texto: "Feedback de la fase quitado" });
      else if (nuevoTipo === "mejorar" && !nuevoTexto.trim()) setMsg({ ok: true, texto: "Escribe qué debe cambiar en esta fase y pulsa Enviar" });
      else setMsg({ ok: true, texto: j.telegram ? "Enviado: lo ve en esa fase de su portal y le llega por Telegram (en un minuto)" : "Guardado: lo ve en esa fase de su portal (no tiene Telegram activado)" });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Feedback de esta fase</p>
        {estado === "repetido" ? <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200">🔄 La modelo la ha cambiado: revísala</span> : null}
        {estado === "mejorar" ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">⚠️ A mejorar · esperando que la cambie</span> : null}
        {estado === "bien" ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">✅ Va bien</span> : null}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar(tipo === "bien" ? null : "bien", tipo === "bien" ? "" : texto)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${tipo === "bien" ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/10 text-white/55 hover:text-white"}`}
          >
            ✅ Va bien
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar(tipo === "mejorar" ? null : "mejorar", tipo === "mejorar" ? "" : texto)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${tipo === "mejorar" ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/10 text-white/55 hover:text-white"}`}
          >
            ⚠️ Mejorar
          </button>
        </div>
      </div>
      {tipo ? (
        <div className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setSucio(true);
            }}
            placeholder={tipo === "mejorar" ? "Qué debe cambiar en esta fase (ej.: más luz, hablar más despacio)" : "Comentario (opcional)"}
            maxLength={600}
            className="input-base h-9 flex-1 text-sm"
          />
          <button type="button" disabled={guardando || !sucio} onClick={() => void guardar(tipo, texto)} className="btn-secondary px-3 text-xs disabled:opacity-40">
            Enviar
          </button>
        </div>
      ) : null}
      {msg ? <p className={`text-xs ${msg.ok ? "text-white/50" : "text-red-300"}`}>{msg.texto}</p> : null}
    </div>
  );
}
