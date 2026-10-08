"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";

type Modelo = { id: string; nombre: string; ambito: string; telegram: boolean };
type Tipo = "reels" | "script" | "pack" | "post" | "otro";
type Item = { tipo: Tipo; cantidad?: number };
type Hist = { id: string; modelo: string; items: Item[]; texto: string | null; creado_por: string | null; created_at: string; telegram: boolean };

const TIPOS: Array<{ id: Tipo; etiqueta: string }> = [
  { id: "reels", etiqueta: "🎬 Reels" },
  { id: "script", etiqueta: "📝 Scripts" },
  { id: "pack", etiqueta: "📦 Packs de fotos" },
  { id: "post", etiqueta: "🖼 Posts de OnlyFans" },
  { id: "otro", etiqueta: "✨ Otro" },
];
const nombreTipo = (t: Tipo) => TIPOS.find((x) => x.id === t)?.etiqueta ?? t;

/** Avisar a las modelos desde el dashboard: «necesitamos reels / un script / packs / posts / otra cosa». Les llega por Telegram y se ve en su portal. */
export function AvisarModelos() {
  const [abierto, setAbierto] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [hist, setHist] = useState<Hist[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [tipos, setTipos] = useState<Partial<Record<Tipo, string>>>({}); // tipo -> cantidad (texto)
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/avisos", { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { modelos: Modelo[]; historial: Hist[] };
    setModelos(j.modelos);
    setHist(j.historial);
  }, []);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const alternarTipo = (t: Tipo) =>
    setTipos((p) => {
      const n = { ...p };
      if (t in n) delete n[t];
      else n[t] = "";
      return n;
    });
  const alternarModelo = (id: string) =>
    setElegidas((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function enviar() {
    setEnviando(true);
    setMsg(null);
    try {
      const items: Item[] = (Object.keys(tipos) as Tipo[]).map((t) => ({ tipo: t, ...(Number(tipos[t]) > 0 ? { cantidad: Number(tipos[t]) } : {}) }));
      const r = await fetch("/api/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelo_ids: [...elegidas], items, texto }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; enviados?: number; conTelegram?: number; sinTelegram?: string[] };
      if (!r.ok) return setMsg({ ok: false, texto: j.error ?? "No se pudo enviar" });
      const sin = j.sinTelegram ?? [];
      setMsg({
        ok: true,
        texto: `Aviso enviado a ${j.enviados} ${j.enviados === 1 ? "modelo" : "modelos"}${j.conTelegram ? ` (${j.conTelegram} por Telegram)` : ""}.${sin.length ? ` ${sin.join(", ")} no ${sin.length === 1 ? "tiene" : "tienen"} Telegram activado: ${sin.length === 1 ? "lo verá" : "lo verán"} en su portal.` : ""}`,
      });
      setTipos({});
      setTexto("");
      setElegidas(new Set());
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  const puede = elegidas.size > 0 && (Object.keys(tipos).length > 0 || texto.trim().length > 0);

  return (
    <GlassCard className="mb-6 p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">📣 Avisar a las modelos</h2>
          <p className="text-sm text-white/45">Pídeles contenido sin escribirles por WhatsApp: les llega por Telegram y lo ven en su portal.</p>
        </div>
        <span className="text-white/50">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto ? (
        <div className="mt-5 space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40">¿A quién?</p>
              <button type="button" onClick={() => setElegidas(elegidas.size === modelos.length ? new Set() : new Set(modelos.map((m) => m.id)))} className="text-xs font-semibold text-[#A78BFA] hover:underline">
                {elegidas.size === modelos.length && modelos.length ? "Quitar todas" : "Elegir todas"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {modelos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => alternarModelo(m.id)}
                  title={m.telegram ? "Tiene Telegram activado" : "Sin Telegram: solo lo verá en su portal"}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${elegidas.has(m.id) ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white/80"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${m.telegram ? "bg-emerald-400" : "bg-white/20"}`} />
                  {m.nombre}
                </button>
              ))}
              {!modelos.length ? <p className="text-sm text-white/40">No hay modelos activas.</p> : null}
            </div>
            <p className="mt-1.5 text-[11px] text-white/35">Punto verde = tiene Telegram activado; gris = solo lo verá en su portal.</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">¿Qué contenido necesitáis? (puedes marcar varios)</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => {
                const on = t.id in tipos;
                return (
                  <div key={t.id} className={`flex items-center gap-1.5 rounded-full border pl-3 ${on ? "border-cyan-400/50 bg-cyan-400/15" : "border-white/10 bg-white/[0.04]"}`}>
                    <button type="button" onClick={() => alternarTipo(t.id)} className={`py-1.5 text-sm font-semibold ${on ? "text-cyan-100" : "text-white/55 hover:text-white/80"}`}>
                      {t.etiqueta}
                    </button>
                    {on ? (
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={tipos[t.id] ?? ""}
                        onChange={(e) => setTipos((p) => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="cuántos"
                        className="mr-1 w-20 rounded-full border-0 bg-black/30 px-2 py-1 text-center text-xs text-white outline-none"
                      />
                    ) : (
                      <span className="pr-3" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Mensaje (opcional)</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={600} placeholder="Ej.: para el viernes, que vamos justos de contenido" className="input-base w-full resize-y text-sm" />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={enviar} disabled={!puede || enviando} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">
              {enviando ? "Enviando…" : `Enviar aviso${elegidas.size ? ` a ${elegidas.size}` : ""}`}
            </button>
            {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</span> : null}
          </div>

          {hist.length ? (
            <div className="border-t border-white/[0.08] pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Últimos avisos enviados</p>
              <ul className="space-y-1.5">
                {hist.slice(0, 8).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-white/65">
                    <span className="text-xs text-white/35">{new Date(h.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="font-semibold text-white">{h.modelo}</span>
                    <span>{h.items.map((i) => `${i.cantidad ? i.cantidad + " " : ""}${nombreTipo(i.tipo)}`).join(" · ")}</span>
                    {h.texto ? <span className="text-white/45">«{h.texto}»</span> : null}
                    <span className="text-xs text-white/30">{h.telegram ? "· Telegram" : "· solo portal"}{h.creado_por ? ` · ${h.creado_por}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
