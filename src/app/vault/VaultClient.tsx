"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, Loader2, Lock, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import type { VaultCategoria, VaultEntry } from "@/types";
import { ConfirmacionDoble } from "@/components/ConfirmacionDoble";

const categories: Array<{ id: VaultCategoria; label: string; icon: string }> = [
  { id: "of_credentials", label: "OF credentials", icon: "🔑" },
  { id: "banco", label: "Banco", icon: "🏦" },
  { id: "telegram", label: "Telegram", icon: "✈️" },
  { id: "api_key", label: "API key", icon: "⚡" },
  { id: "social", label: "Social", icon: "📱" },
  { id: "otro", label: "Otro", icon: "◆" },
];

type Ambito = "privado" | "compartido";

export function VaultClient({
  entries: todas,
  modelos,
  esDueno,
  ambitoListo,
  papelera = [],
}: {
  papelera?: VaultEntry[];
  entries: VaultEntry[];
  modelos: { id: string; nombre: string }[];
  esDueno: boolean;
  ambitoListo: boolean;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<{ title: string; value: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<VaultEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombreModelo = (id?: string | null) => modelos.find((m) => m.id === id)?.nombre;
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [borrarDef, setBorrarDef] = useState<VaultEntry | null>(null);
  const [borrandoDef, setBorrandoDef] = useState(false);
  const [errorDef, setErrorDef] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VaultEntry | null>(null);

  // El dueño tiene dos baules (privado y compartido); los demas usuarios solo ven el compartido
  const [ambito, setAmbito] = useState<Ambito>(esDueno ? "privado" : "compartido");
  const [busca, setBusca] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const delAmbito = todas.filter((e) => (e.ambito ?? "privado") === ambito);
  const entries = delAmbito.filter((e) => {
    if (filtroModelo && (filtroModelo === "_sin" ? e.modelo_id : e.modelo_id !== filtroModelo)) return false;
    const q = busca.trim().toLowerCase();
    return !q || `${e.nombre} ${e.descripcion ?? ""} ${nombreModelo(e.modelo_id) ?? ""}`.toLowerCase().includes(q);
  });
  const modelosUsados = modelos.filter((m) => delAmbito.some((e) => e.modelo_id === m.id));

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

  async function borrarParaSiempre() {
    if (!borrarDef) return;
    setBorrandoDef(true);
    setErrorDef(null);
    try {
      const res = await fetch(`/api/vault?id=${borrarDef.id}&definitivo=1&confirmar=${encodeURIComponent(borrarDef.nombre)}`, { method: "DELETE" });
      if (res.ok) {
        setBorrarDef(null);
        router.refresh();
      } else setErrorDef(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo borrar");
    } catch {
      setErrorDef("No se pudo conectar con el servidor.");
    } finally {
      setBorrandoDef(false);
    }
  }

  async function restaurar(entry: VaultEntry) {
    const res = await fetch("/api/vault", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id }) });
    if (!res.ok) setError("No se pudo restaurar");
    router.refresh();
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
      {esDueno ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {(["privado", "compartido"] as Ambito[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAmbito(a);
                setFiltroModelo("");
              }}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${ambito === a ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/15" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}
            >
              {a === "privado" ? <Lock className="h-5 w-5 shrink-0 text-[#c4b5fd]" /> : <Users className="h-5 w-5 shrink-0 text-emerald-300" />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-white">{a === "privado" ? "Mi baúl" : "Baúl compartido"}</span>
                <span className="block text-xs text-white/45">{a === "privado" ? "Solo lo ves tú" : "Lo ves tú y tu socio"}</span>
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">{todas.filter((e) => (e.ambito ?? "privado") === a).length}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          <Users className="h-4 w-4" /> Baúl compartido: lo que guardes aquí lo ven tú y el dueño del panel.
        </p>
      )}
      {esDueno && !ambitoListo ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Falta ejecutar el SQL <code>20261011_vault_ambito.sql</code> en Supabase para poder compartir entradas. Mientras tanto todo sigue siendo privado.
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="text-sm text-[color:var(--text-secondary)]">
          {entries.length}
          {entries.length !== delAmbito.length ? ` de ${delAmbito.length}` : ""} entradas
        </p>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="input-base py-1.5 text-xs" style={{ width: "16rem", maxWidth: "100%" }} />
        {modelosUsados.length ? (
          <select value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} className="input-base py-1.5 text-xs" style={{ width: "auto" }}>
            <option value="">Todas las modelos</option>
            <option value="_sin">Sin modelo asociada</option>
            {modelosUsados.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        ) : null}
        <span className="flex-1" />
        <button
          className="btn-primary flex h-10 items-center gap-2 px-4 text-sm"
          onClick={() => {
            setEditando(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nueva {esDueno ? (ambito === "privado" ? "en mi baúl" : "en el compartido") : ""}
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
            {esDueno ? (
              <label className="mt-4 block text-xs text-[color:var(--text-secondary)]">
                ¿Dónde se guarda?
                <select name="ambito" className="input mt-1 h-10 w-full px-3 text-sm" defaultValue={editando?.ambito ?? ambito} disabled={!ambitoListo}>
                  <option value="privado">Mi baúl (solo yo)</option>
                  <option value="compartido">Baúl compartido (yo y mi socio)</option>
                </select>
              </label>
            ) : null}
            <input name="nombre" className="input mt-3 h-10 w-full px-3 text-sm" placeholder="Nombre" defaultValue={editando?.nombre ?? ""} required />
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

      {esDueno && papelera.length ? (
        <details className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/80">
            Papelera ({papelera.length}) <span className="font-normal text-white/40">· lo eliminado, guardado y cifrado</span>
          </summary>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {papelera.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-white/80">
                      {categories.find((c) => c.id === e.categoria)?.icon} {categories.find((c) => c.id === e.categoria)?.label ?? e.categoria}
                    </span>
                    <span className="truncate font-semibold text-white">{e.nombre}</span>
                  </p>
                  {[nombreModelo(e.modelo_id), e.descripcion].filter(Boolean).length ? (
                    <p className="truncate text-xs text-[color:var(--text-secondary)]">{[nombreModelo(e.modelo_id), e.descripcion].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  <p className="text-xs text-white/40">
                    {(e.ambito ?? "privado") === "compartido" ? "Baúl compartido" : "Tu baúl"} · eliminada{" "}
                    {e.eliminada_at ? new Date(e.eliminada_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    {e.eliminada_por ? ` por ${e.eliminada_por}` : ""}
                  </p>
                </div>
                <button onClick={() => reveal(e)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white">Ver</button>
                <button onClick={() => restaurar(e)} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">Restaurar</button>
                <button
                  onClick={() => {
                    setErrorDef(null);
                    setBorrarDef(e);
                  }}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300/80 hover:bg-red-500/10 hover:text-red-300"
                >
                  Eliminar para siempre
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmacionDoble
        abierto={Boolean(borrarDef)}
        titulo={`Eliminar «${borrarDef?.nombre ?? ""}» para siempre`}
        detalle="Se borrará esta credencial y todas sus versiones anteriores guardadas. No habrá forma de recuperarla."
        nombre={borrarDef?.nombre ?? ""}
        ocupado={borrandoDef}
        error={errorDef}
        onConfirmar={borrarParaSiempre}
        onCancelar={() => setBorrarDef(null)}
      />
    </div>
  );
}
