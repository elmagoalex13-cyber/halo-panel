"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

interface Frase {
  id: string;
  frase: string;
  cancion_nombre: string;
  cancion_artista: string | null;
  audio_id_ig: string | null;
  origen: string;
  puntuacion: number;
  veces_usada: number;
  activa: boolean;
}

export function FrasesClient({ frases: init }: { frases: Frase[] }) {
  const [frases, setFrases] = useState(init);
  const [filter, setFilter] = useState<"all" | "activa" | "inactiva">("all");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [form, setForm] = useState({ frase: "", cancion_nombre: "", cancion_artista: "", audio_id_ig: "", puntuacion: "5" });
  const filtered = frases.filter((frase) => (filter === "activa" ? frase.activa : filter === "inactiva" ? !frase.activa : true));

  async function deleteFrase(id: string) {
    setLoading(id);
    try {
      const res = await fetch("/api/frases", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setFrases((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setLoading(null);
    }
  }

  async function toggleActiva(frase: Frase) {
    setLoading(frase.id);
    const res = await fetch("/api/frases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: frase.id, activa: !frase.activa }),
    });
    if (res.ok) setFrases((prev) => prev.map((item) => (item.id === frase.id ? { ...item, activa: !item.activa } : item)));
    setLoading(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading("new");
    const res = await fetch("/api/frases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, puntuacion: parseInt(form.puntuacion, 10) }),
    });
    if (res.ok) {
      const { data } = await res.json();
      setFrases((prev) => [data, ...prev]);
      setShowForm(false);
      setForm({ frase: "", cancion_nombre: "", cancion_artista: "", audio_id_ig: "", puntuacion: "5" });
    }
    setLoading(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-halo-text">Banco de Frases</h1>
          <p className="mt-1 text-sm text-halo-subtle">{frases.filter((frase) => frase.activa).length} activas · {frases.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "activa", "inactiva"] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${filter === value ? "border-halo-accent/30 bg-halo-accent/15 text-halo-accent" : "border-halo-border text-halo-subtle hover:text-halo-text"}`}>
              {value === "all" ? "Todas" : value === "activa" ? "Activas" : "Inactivas"}
            </button>
          ))}
          <button onClick={() => setShowForm(!showForm)} className="btn-primary px-3 py-1.5 text-sm">+ Nueva</button>
        </div>
      </div>
      {showForm ? (
        <form onSubmit={handleSubmit} className="card space-y-3 border-halo-accent/30">
          <h3 className="font-display text-sm font-semibold text-halo-text">Nueva frase</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-halo-subtle">Frase / Caption</label><input className="input-base" placeholder="Texto..." value={form.frase} onChange={(event) => setForm((prev) => ({ ...prev, frase: event.target.value }))} required /></div>
            <div><label className="mb-1 block text-xs text-halo-subtle">Cancion</label><input className="input-base" placeholder="Nombre" value={form.cancion_nombre} onChange={(event) => setForm((prev) => ({ ...prev, cancion_nombre: event.target.value }))} required /></div>
            <div><label className="mb-1 block text-xs text-halo-subtle">Artista</label><input className="input-base" placeholder="Artista" value={form.cancion_artista} onChange={(event) => setForm((prev) => ({ ...prev, cancion_artista: event.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-halo-subtle">Puntuacion (1-10)</label><input type="number" min="1" max="10" className="input-base" value={form.puntuacion} onChange={(event) => setForm((prev) => ({ ...prev, puntuacion: event.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-3 py-1.5 text-sm">Cancelar</button><button type="submit" disabled={loading === "new"} className="btn-primary px-3 py-1.5 text-sm">{loading === "new" ? "Guardando..." : "Guardar"}</button></div>
        </form>
      ) : null}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-halo-border">{["Frase", "Cancion", "Punt.", "Usos", "Estado", ""].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-halo-subtle">{heading}</th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-halo-subtle">Sin frases</td></tr> : null}
            {filtered.map((frase) => (
              <tr key={frase.id} className={`border-b border-halo-border/50 hover:bg-white/[0.02] ${!frase.activa ? "opacity-50" : ""}`}>
                <td className="max-w-xs px-4 py-3"><p className="line-clamp-2 text-sm text-halo-text">{frase.frase}</p></td>
                <td className="px-4 py-3"><div className="text-sm text-halo-text">{frase.cancion_nombre}</div>{frase.cancion_artista ? <div className="text-xs text-halo-subtle">{frase.cancion_artista}</div> : null}</td>
                <td className="px-4 py-3"><div className="flex gap-0.5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-2 w-2 rounded-sm" style={{ backgroundColor: index < frase.puntuacion ? "#7B5EFF" : "#2A2D40" }} />)}</div></td>
                <td className="px-4 py-3 font-mono text-sm text-halo-subtle">{frase.veces_usada}</td>
                <td className="px-4 py-3"><button onClick={() => toggleActiva(frase)} disabled={loading === frase.id} className={`rounded-md border px-3 py-1 text-xs transition-colors ${frase.activa ? "border-green-500/30 bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400" : "border-halo-border bg-halo-muted text-halo-subtle hover:bg-green-500/15 hover:text-green-400"}`}>{loading === frase.id ? "..." : frase.activa ? "Activa" : "Inactiva"}</button></td>
                <td className="px-4 py-3"><button onClick={() => deleteFrase(frase.id)} disabled={loading === frase.id} className="rounded-md border border-white/10 bg-white/5 p-1.5 text-white/30 hover:border-red-500/30 hover:text-red-400 transition-colors" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
