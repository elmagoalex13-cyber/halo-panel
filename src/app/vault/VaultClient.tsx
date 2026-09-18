"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { VaultCategoria, VaultEntry } from "@/types";

const categories: Array<{ id: VaultCategoria; label: string; icon: string }> = [
  { id: "of_credentials", label: "OF credentials", icon: "🔑" },
  { id: "banco", label: "Banco", icon: "🏦" },
  { id: "telegram", label: "Telegram", icon: "✈️" },
  { id: "api_key", label: "API key", icon: "⚡" },
  { id: "social", label: "Social", icon: "📱" },
  { id: "otro", label: "Otro", icon: "◆" },
];

export function VaultClient({ entries, modelos }: { entries: VaultEntry[]; modelos: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<{ title: string; value: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<VaultEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombreModelo = (id?: string | null) => modelos.find((m) => m.id === id)?.nombre;
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VaultEntry | null>(null);

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        entries: entries.filter((entry) => entry.categoria === category.id),
      })),
    [entries],
  );

  async function reveal(entry: VaultEntry) {
    const response = await fetch(`/api/vault?id=${entry.id}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "No se pudo descifrar la entrada");
      return;
    }
    setError(null);
    setRevealed({ title: entry.nombre, value: data.value });
  }

  async function addEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    try {
      if (editando) formData.set("id", editando.id);
      const res = await fetch("/api/vault", { method: editando ? "PUT" : "POST", body: formData });
      if (res.ok) {
        setShowForm(false);
        setEditando(null);
        setError(null);
        router.refresh();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "No se pudo guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entry: VaultEntry) {
    setDeletingId(entry.id);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/vault?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) setError("No se pudo eliminar");
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-[color:var(--text-secondary)]">{entries.length} entradas agrupadas por categoría</p>
        <button className="btn-primary flex h-10 items-center gap-2 px-4 text-sm" onClick={() => {
            setEditando(null);
            setShowForm(true);
          }}>
          <Plus className="h-4 w-4" /> Nueva
        </button>
      </div>

      {error ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map((group) => (
          <section key={group.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h2 className="font-display text-lg font-semibold text-white">
              <span className="mr-2">{group.icon}</span>
              {group.label}
            </h2>
            <div className="mt-4 space-y-3">
              {group.entries.length ? (
                group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{entry.nombre}</p>
                      <p className="truncate text-xs text-[color:var(--text-secondary)]">
                        {[nombreModelo(entry.modelo_id), entry.descripcion].filter(Boolean).join(" · ") || "Sin descripción"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.04] text-white"
                        onClick={() => reveal(entry)}
                        aria-label="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.04] text-white"
                        onClick={() => {
                          setEditando(entry);
                          setShowForm(true);
                        }}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.04] text-red-400 disabled:opacity-50"
                        onClick={() => setConfirmDelete(entry)}
                        disabled={deletingId === entry.id}
                        aria-label="Eliminar"
                      >
                        {deletingId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[color:var(--text-muted)]">Sin entradas</p>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Modal: ver valor descifrado */}
      {revealed ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-white">{revealed.title}</h2>
              <button onClick={() => setRevealed(null)} className="text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <pre className="mt-4 overflow-auto rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 font-code text-sm text-white">
              {revealed.value}
            </pre>
            <button
              className="btn-primary mt-4 flex h-10 items-center gap-2 px-4 text-sm"
              onClick={() => navigator.clipboard.writeText(revealed.value)}
            >
              <Copy className="h-4 w-4" /> Copiar
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal: confirmar borrado */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-sm p-5">
            <h2 className="font-display text-xl font-semibold text-white">¿Eliminar entrada?</h2>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              <strong className="text-white">{confirmDelete.nombre}</strong> se eliminará permanentemente.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded-[10px] border border-white/[0.1] bg-white/[0.04] px-4 text-sm text-white"
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
              </button>
              <button
                className="h-10 rounded-[10px] bg-red-500/80 px-4 text-sm font-medium text-white hover:bg-red-500"
                onClick={() => deleteEntry(confirmDelete)}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: nueva entrada */}
      {showForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={addEntry} className="glass-card w-full max-w-lg p-5">
            <h2 className="font-display text-2xl font-semibold text-white">{editando ? "Editar entrada" : "Nueva entrada"}</h2>
            <input name="nombre" className="input mt-4 h-10 w-full px-3 text-sm" placeholder="Nombre" defaultValue={editando?.nombre ?? ""} required />
            <select name="categoria" className="input mt-3 h-10 w-full px-3 text-sm" defaultValue={editando?.categoria ?? "otro"}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <input name="descripcion" className="input mt-3 h-10 w-full px-3 text-sm" placeholder="Descripción" defaultValue={editando?.descripcion ?? ""} />
            <select name="modelo_id" className="input mt-3 h-10 w-full px-3 text-sm" defaultValue={editando?.modelo_id ?? ""}>
              <option value="">Sin modelo asociada</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <textarea
              name="value"
              className="input mt-3 min-h-28 w-full p-3 text-sm"
              placeholder={editando ? "Valor nuevo (déjalo vacío para no cambiarlo)" : "Valor a cifrar"}
              required={!editando}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-[10px] border border-white/[0.1] bg-white/[0.04] px-4 text-sm text-white"
                onClick={() => {
                  setShowForm(false);
                  setEditando(null);
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button className="btn-primary flex h-10 items-center gap-2 px-4 text-sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar cifrado
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
