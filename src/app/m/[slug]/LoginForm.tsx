"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ slug, nombre }: { slug: string; nombre: string }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, usuario, password }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "No se pudo entrar");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#8B5CF6]/20 text-xl text-[#A78BFA]">◈</div>
          <h1 className="font-display text-2xl font-semibold text-white">Hola, {nombre}</h1>
          <p className="mt-1 text-sm text-white/45">Entra para subir tus videos</p>
        </div>
        <input
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="Usuario"
          className="input-base h-12 text-base"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Contrasena"
          className="input-base h-12 text-base"
        />
        {error ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <button
          disabled={cargando || !usuario || !password}
          className="btn-primary h-12 w-full text-base disabled:opacity-40"
        >
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
