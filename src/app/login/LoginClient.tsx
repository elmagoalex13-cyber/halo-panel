"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginClient({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "No se pudo iniciar sesión");
      router.replace(searchParams.get("next") || "/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6 shadow-2xl shadow-black/40">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#A78BFA]">HALO</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white">Acceso admin</h1>
          <p className="mt-1 text-sm text-white/45">Entra con tu usuario y contraseña del panel.</p>
        </div>

        {!configured ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            Falta configurar `ADMIN_USERNAME`, `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET` en las variables de entorno.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/40">
              Usuario
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="input-base mt-1.5 w-full" />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/40">
              Contraseña
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" className="input-base mt-1.5 w-full" />
            </label>
            {error ? <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            <button disabled={loading || !username || !password} className="btn-primary w-full py-3 text-sm disabled:opacity-40">
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
