"use client";

import { useState } from "react";

type Cual = "of" | "skrill";

/** Aviso en el portal: la agencia no ha podido entrar con ese acceso. Trae el formulario para volver a escribirlo (solo ese acceso). */
export function AvisoAccesosInvalidos({ cuales }: { cuales: Cual[] }) {
  const [pendientes, setPendientes] = useState<Cual[]>(cuales);
  if (!pendientes.length) return <p className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">✓ Gracias, hemos recibido tus accesos otra vez. Los comprobamos y listo.</p>;
  return (
    <div className="space-y-3">
      {pendientes.includes("of") ? <FormularioAcceso cual="of" onHecho={() => setPendientes((p) => p.filter((c) => c !== "of"))} /> : null}
      {pendientes.includes("skrill") ? <FormularioAcceso cual="skrill" onHecho={() => setPendientes((p) => p.filter((c) => c !== "skrill"))} /> : null}
    </div>
  );
}

function FormularioAcceso({ cual, onHecho }: { cual: Cual; onHecho: () => void }) {
  const esOF = cual === "of";
  const [v, setV] = useState({ of_correo: "", of_password: "", sk_correo: "", sk_password_correo: "", sk_password: "", sk_pin: "" });
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = "input-base h-12 w-full text-base";

  const completo = esOF ? Boolean(v.of_correo.trim() && v.of_password.trim()) : Boolean(v.sk_correo.trim() && v.sk_password_correo.trim() && v.sk_password.trim() && v.sk_pin.length >= 4);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/accesos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(esOF ? { modo: "of", of_correo: v.of_correo, of_password: v.of_password } : { modo: "sk", sk_correo: v.sk_correo, sk_password_correo: v.sk_password_correo, sk_password: v.sk_password, sk_pin: v.sk_pin }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudieron guardar tus accesos");
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar tus accesos");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-red-400/40 bg-red-400/10 p-4">
      <div>
        <p className="font-semibold text-white">⚠️ No hemos podido entrar con tu {esOF ? "OnlyFans" : "Skrill"}</p>
        <p className="mt-0.5 text-sm text-white/60">Revisa que esté bien y vuelve a escribirlo. Se guarda cifrado y solo lo ve la agencia.</p>
      </div>
      {esOF ? (
        <>
          <input type="email" value={v.of_correo} onChange={(e) => setV({ ...v, of_correo: e.target.value })} placeholder="Correo de OnlyFans" autoComplete="off" autoCapitalize="none" className={campo} />
          <input type={ver ? "text" : "password"} value={v.of_password} onChange={(e) => setV({ ...v, of_password: e.target.value })} placeholder="Contraseña de OnlyFans" autoComplete="off" autoCapitalize="none" className={campo} />
        </>
      ) : (
        <>
          <input type="email" value={v.sk_correo} onChange={(e) => setV({ ...v, sk_correo: e.target.value })} placeholder="Correo de Skrill" autoComplete="off" autoCapitalize="none" className={campo} />
          <input type={ver ? "text" : "password"} value={v.sk_password_correo} onChange={(e) => setV({ ...v, sk_password_correo: e.target.value })} placeholder="Contraseña de ese correo" autoComplete="off" autoCapitalize="none" className={campo} />
          <input type={ver ? "text" : "password"} value={v.sk_password} onChange={(e) => setV({ ...v, sk_password: e.target.value })} placeholder="Contraseña de Skrill" autoComplete="off" autoCapitalize="none" className={campo} />
          <input type={ver ? "text" : "password"} inputMode="numeric" value={v.sk_pin} onChange={(e) => setV({ ...v, sk_pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="PIN de Skrill (4 a 8 números)" autoComplete="off" className={campo} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void enviar()} disabled={enviando || !completo} className="btn-primary h-12 px-5 text-sm disabled:opacity-50">
          {enviando ? "Enviando…" : "Enviar de nuevo"}
        </button>
        <button type="button" onClick={() => setVer((x) => !x)} className="text-xs font-semibold text-white/50 hover:text-white/80">
          {ver ? "Ocultar contraseñas" : "Ver contraseñas"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
