"use client";

import { useState } from "react";
import { GlassCard } from "@/components/GlassCard";

type Estado = { slug: string | null; usuario: string | null; activo: boolean };
type Generado = { slug: string; usuario: string; password: string };

export function PortalAccesoButton({ modeloId, nombre }: { modeloId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [generado, setGenerado] = useState<Generado | null>(null);
  const [usuario, setUsuario] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function abrir() {
    setAbierto(true);
    setGenerado(null);
    setError(null);
    const res = await fetch(`/api/modelos/${modeloId}/portal`);
    if (res.ok) {
      const e = (await res.json()) as Estado;
      setEstado(e);
      setUsuario(e.usuario ?? "");
    }
  }

  async function generar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error");
      setGenerado(j as Generado);
      setEstado({ slug: j.slug, usuario: j.usuario, activo: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  const slug = generado?.slug ?? estado?.slug ?? null;
  const enlace = slug && typeof window !== "undefined" ? `${window.location.origin}/m/${slug}` : slug ? `/m/${slug}` : null;

  async function copiar() {
    if (!generado || !enlace) return;
    const texto = `Portal de ${nombre}\nEnlace: ${enlace}\nUsuario: ${generado.usuario}\nContrasena: ${generado.password}`;
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <>
      <button onClick={abrir} className="btn-secondary px-2.5 py-1 text-xs" title="Acceso al portal de la modelo">
        Portal
      </button>
      {abierto ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-md p-6">
            <h2 className="font-display text-lg font-semibold text-white">Portal de {nombre}</h2>
            <p className="mt-1 text-xs text-white/40">La modelo entra con usuario y contrasena para subir sus videos.</p>

            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-white/50">
                Usuario
                <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="se genera del nombre" className="input-base" />
              </label>

              {enlace ? (
                <p className="break-all rounded-lg bg-white/[0.05] px-3 py-2 font-code text-xs text-[#A78BFA]">{enlace}</p>
              ) : null}

              {generado ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                  <p className="text-white/80">
                    Usuario: <b className="font-code">{generado.usuario}</b>
                  </p>
                  <p className="text-white/80">
                    Contrasena: <b className="font-code">{generado.password}</b>
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-300/80">Guardala ahora: no se vuelve a mostrar.</p>
                </div>
              ) : estado?.activo ? (
                <p className="text-xs text-white/40">Acceso activo. Si generas una contrasena nueva, la anterior deja de funcionar.</p>
              ) : (
                <p className="text-xs text-white/40">Todavia no tiene acceso.</p>
              )}
              {error ? <p className="text-xs text-red-300">{error}</p> : null}
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <button onClick={() => setAbierto(false)} className="btn-secondary px-4 py-2 text-sm">
                Cerrar
              </button>
              <div className="flex gap-2">
                {generado ? (
                  <button onClick={copiar} className="btn-secondary px-4 py-2 text-sm">
                    {copiado ? "Copiado" : "Copiar datos"}
                  </button>
                ) : null}
                <button onClick={generar} disabled={cargando} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                  {cargando ? "Generando..." : estado?.activo ? "Nueva contrasena" : "Crear acceso"}
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </>
  );
}
