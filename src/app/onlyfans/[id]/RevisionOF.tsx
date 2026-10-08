"use client";

import { useState } from "react";
import { GlassCard } from "@/components/GlassCard";

/** Revisión de la agencia sobre un script, pack o post: aprobar o pedir mejoras (con comentario). La modelo lo ve en su portal. */
export function RevisionOF({
  coleccionId,
  tipo,
  inicial,
  textoInicial,
}: {
  coleccionId: string;
  tipo: "script" | "pack" | "post";
  inicial: "aprobado" | "mejorar" | null;
  textoInicial: string | null;
}) {
  const [revision, setRevision] = useState(inicial);
  const [texto, setTexto] = useState(textoInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [sucio, setSucio] = useState(false);
  const nombre = tipo === "script" ? "este script" : tipo === "pack" ? "este pack" : "este post";

  async function enviar(nueva: "aprobado" | "mejorar" | null, t: string) {
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/onlyfans/revision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coleccion_id: coleccionId, revision: nueva, texto: t }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setRevision(nueva);
        setSucio(false);
        setMsg({ ok: true, texto: nueva === "aprobado" ? "Aprobado: cuenta para los objetivos de la captación" : nueva === "mejorar" ? "Guardado: la modelo verá lo que debe mejorar" : "Revisión quitada" });
      } else setMsg({ ok: false, texto: j.error ?? "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <GlassCard className="space-y-3 p-5">
      <div>
        <p className="text-sm font-semibold text-white">Revisión de la agencia</p>
        <p className="text-xs text-white/45">
          {tipo === "script" ? "Un script solo cuenta para poder crear la cuenta de Instagram cuando lo APRUEBAS aquí (completo y bien hecho)." : `Dile a la modelo si ${nombre} está bien o qué debe mejorar.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={guardando}
          onClick={() => void enviar(revision === "aprobado" ? null : "aprobado", revision === "aprobado" ? "" : texto)}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${revision === "aprobado" ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/15 text-white/60 hover:text-white"}`}
        >
          ✅ Aprobado
        </button>
        <button
          disabled={guardando}
          onClick={() => void enviar(revision === "mejorar" ? null : "mejorar", revision === "mejorar" ? "" : texto)}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${revision === "mejorar" ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/15 text-white/60 hover:text-white"}`}
        >
          ⚠️ Mejorar
        </button>
      </div>
      {revision ? (
        <div className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setSucio(true);
            }}
            maxLength={800}
            placeholder={revision === "mejorar" ? "Qué debe mejorar (lo ve la modelo)" : "Comentario (opcional)"}
            className="input-base h-10 flex-1 text-sm"
          />
          <button disabled={guardando || !sucio} onClick={() => void enviar(revision, texto)} className="btn-secondary px-4 text-sm disabled:opacity-40">
            Guardar
          </button>
        </div>
      ) : null}
      {msg ? <p className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</p> : null}
    </GlassCard>
  );
}
