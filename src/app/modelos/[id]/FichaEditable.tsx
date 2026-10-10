"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Datos = {
  nombre: string;
  nombre_real: string | null;
  email: string | null;
  telefono: string | null;
  porcentaje_comision: number | null;
  notas: string | null;
  portal_token: string | null;
};

/** Ficha de la modelo (nombre, email, teléfono, comisión, notas): se ve y se puede cambiar en cualquier momento. */
export function FichaEditable({ modeloId, datos }: { modeloId: string; datos: Datos }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: datos.nombre,
    nombre_real: datos.nombre_real ?? "",
    email: datos.email ?? "",
    telefono: datos.telefono ?? "",
    porcentaje_comision: datos.porcentaje_comision ?? 70,
    notas: datos.notas ?? "",
  });

  async function guardar() {
    if (!form.nombre.trim()) return setError("El nombre no puede quedar vacío");
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, nombre: form.nombre.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  function cancelar() {
    setForm({
      nombre: datos.nombre,
      nombre_real: datos.nombre_real ?? "",
      email: datos.email ?? "",
      telefono: datos.telefono ?? "",
      porcentaje_comision: datos.porcentaje_comision ?? 70,
      notas: datos.notas ?? "",
    });
    setError(null);
    setEditando(false);
  }

  const solo: Array<[string, string | null | undefined]> = [
    ["Nombre", datos.nombre],
    ["Nombre real", datos.nombre_real],
    ["Email", datos.email],
    ["Teléfono", datos.telefono],
    ["Comisión agencia", datos.porcentaje_comision != null ? `${datos.porcentaje_comision}%` : null],
    ["Portal", datos.portal_token ? `/m/${datos.portal_token}` : "Sin acceso creado"],
    ["Notas", datos.notas],
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-halo-subtle">Ficha</h2>
        {editando ? null : (
          <button type="button" onClick={() => setEditando(true)} className="btn-secondary px-3 py-1 text-xs">
            ✎ Editar datos
          </button>
        )}
      </div>

      {editando ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre">
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-base" />
            </Campo>
            <Campo etiqueta="Nombre real">
              <input value={form.nombre_real} onChange={(e) => setForm({ ...form, nombre_real: e.target.value })} className="input-base" />
            </Campo>
            <Campo etiqueta="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-base" />
            </Campo>
            <Campo etiqueta="Teléfono">
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="input-base" />
            </Campo>
          </div>
          <Campo etiqueta={`Comisión agencia: ${form.porcentaje_comision}%`}>
            <input type="range" min={0} max={100} value={form.porcentaje_comision} onChange={(e) => setForm({ ...form, porcentaje_comision: Number(e.target.value) })} className="w-full accent-[#8B5CF6]" />
          </Campo>
          <Campo etiqueta="Notas">
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={3} className="input-base w-full resize-y" />
          </Campo>
          <p className="text-xs text-halo-subtle">Se puede cambiar cuando quieras, también después de crearle el portal: su enlace y su acceso no se tocan.</p>
          {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={cancelar} disabled={guardando} className="btn-secondary px-4 py-2 text-sm">
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={guardando} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {solo.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wider text-halo-subtle">{k}</dt>
              <dd className="mt-0.5 break-words text-halo-text">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-halo-subtle">{etiqueta}</span>
      {children}
    </label>
  );
}
