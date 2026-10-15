"use client";

import { useState } from "react";

/** Aviso en el portal de la modelo que ya envio su Skrill pero no el PIN: lo escribe aqui y se guarda cifrado junto a su Skrill. */
export function AvisoPinSkrill() {
  const [pin, setPin] = useState("");
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/accesos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sk_pin: pin }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar el PIN");
      setHecho(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el PIN");
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) return <p className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">✓ Gracias, ya tenemos tu PIN de Skrill.</p>;

  return (
    <section className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
      <div>
        <p className="font-semibold text-white">⚠️ Falta tu PIN de Skrill</p>
        <p className="mt-0.5 text-sm text-white/60">Nos diste tu Skrill pero sin el PIN. Escríbelo aquí (4 a 8 números): se guarda cifrado y solo lo ve la agencia.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type={ver ? "text" : "password"}
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="PIN de Skrill"
          autoComplete="off"
          className="input-base h-12 w-44 text-base"
        />
        <button type="button" onClick={() => void guardar()} disabled={enviando || pin.length < 4} className="btn-primary h-12 px-5 text-sm disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar PIN"}
        </button>
        <button type="button" onClick={() => setVer((v) => !v)} className="text-xs font-semibold text-white/50 hover:text-white/80">
          {ver ? "Ocultar" : "Ver"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
