"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";

type Campo = "of_correo" | "of_password" | "sk_correo" | "sk_password_correo" | "sk_password";

function Entrada({ etiqueta, valor, onChange, secreto = false, tipo = "text" }: { etiqueta: string; valor: string; onChange: (v: string) => void; secreto?: boolean; tipo?: string }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-white/55">{etiqueta}</span>
      <div className="relative">
        <input
          type={secreto && !ver ? "password" : tipo}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="input-base h-12 w-full pr-11 text-base"
        />
        {secreto ? (
          <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80" aria-label={ver ? "Ocultar" : "Mostrar"}>
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </label>
  );
}

/** Pantalla obligatoria del portal: la modelo da sus accesos de OnlyFans y Skrill antes de seguir. Se guardan cifrados. */
export function AccesosForm({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [d, setD] = useState<Record<Campo, string>>({ of_correo: "", of_password: "", sk_correo: "", sk_password_correo: "", sk_password: "" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const poner = (k: Campo) => (v: string) => setD((p) => ({ ...p, [k]: v }));
  const completo = Object.values(d).every((v) => v.trim().length > 0);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/accesos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (res.ok) {
        router.refresh();
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(j?.error ?? "No se pudo guardar");
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <form onSubmit={enviar} className="glass-card w-full max-w-md space-y-5 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#8B5CF6]/20 text-[#A78BFA]">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-white">Hola, {nombre}</h1>
          <p className="mt-1 text-sm leading-relaxed text-white/50">
            Antes de empezar necesitamos tus accesos. Se guardan <span className="text-white/80">cifrados</span> y solo los ve la agencia. Tú no los volverás a ver aquí.
          </p>
        </div>

        <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <legend className="px-2 text-sm font-semibold text-white">OnlyFans</legend>
          <Entrada etiqueta="Correo de OnlyFans" valor={d.of_correo} onChange={poner("of_correo")} tipo="email" />
          <Entrada etiqueta="Contraseña de OnlyFans" valor={d.of_password} onChange={poner("of_password")} secreto />
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <legend className="px-2 text-sm font-semibold text-white">Skrill (cobros)</legend>
          <Entrada etiqueta="Correo de Skrill" valor={d.sk_correo} onChange={poner("sk_correo")} tipo="email" />
          <Entrada etiqueta="Contraseña de ese correo" valor={d.sk_password_correo} onChange={poner("sk_password_correo")} secreto />
          <Entrada etiqueta="Contraseña de Skrill" valor={d.sk_password} onChange={poner("sk_password")} secreto />
        </fieldset>

        {error ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <button disabled={!completo || enviando} className="btn-primary h-12 w-full text-base disabled:opacity-40">
          {enviando ? "Guardando…" : "Guardar y continuar"}
        </button>
      </form>
    </main>
  );
}
