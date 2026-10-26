"use client";

import { useState } from "react";

/**
 * Feedback de la agencia para la modelo sobre un video que ya esta en la mesa de aprobacion (editado). Le llega por Telegram con el video y
 * lo ve en su portal. NO cambia el estado del video: aprobarlo, descartarlo o rehacerlo se decide aparte.
 */
export function FeedbackMesa({
  piezaId,
  modeloId,
  tipoInicial,
  textoInicial,
}: {
  piezaId: string;
  modeloId: string | null | undefined;
  tipoInicial: "bien" | "mejorar" | null;
  textoInicial: string;
}) {
  const [tipo, setTipo] = useState<"bien" | "mejorar" | null>(tipoInicial);
  const [texto, setTexto] = useState(textoInicial);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  if (!modeloId) return null;

  async function guardar(nuevoTipo: "bien" | "mejorar" | null, nuevoTexto: string) {
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pieza_id: piezaId, tipo: nuevoTipo, texto: nuevoTexto }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; telegram?: boolean };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
      setTipo(nuevoTipo);
      setSucio(false);
      if (!nuevoTipo) setMsg({ ok: true, texto: "Feedback quitado" });
      else if (nuevoTipo === "mejorar" && !nuevoTexto.trim()) setMsg({ ok: true, texto: "Escribe qué debe mejorar y pulsa Enviar: entonces se le manda" });
      else setMsg({ ok: true, texto: j.telegram ? "Enviado: en un minuto le llega el vídeo por Telegram con tu comentario. El vídeo sigue aquí: tú decides si lo usas" : "Guardado: lo verá en su portal (no tiene Telegram activado). El vídeo sigue aquí" });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-white/35">
        Feedback para la modelo <span className="font-normal normal-case tracking-normal text-white/25">· le llega por Telegram con el vídeo; no cambia su estado</span>
      </p>
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
            placeholder={tipo === "mejorar" ? "Qué debe mejorar (ej.: más luz, hablar más despacio)" : "Comentario (opcional)"}
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
