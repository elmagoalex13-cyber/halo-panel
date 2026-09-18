"use client";

import { useState } from "react";
import { ExternalLink, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { BancoReferenciasSection } from "./BancoReferenciasSection";
import { formatDate } from "@/lib/utils";
import type { BancoReferenciaVideo, Modelo, ReferenciaCuenta } from "@/types";

export function ReferenciasTab({
  cuentas: initialCuentas,
  bancoVideos,
  modelos,
}: {
  cuentas: ReferenciaCuenta[];
  bancoVideos: BancoReferenciaVideo[];
  modelos: Modelo[];
}) {
  const [cuentas, setCuentas] = useState(initialCuentas);
  const [form, setForm] = useState({ username: "", categoria: "", notas: "" });
  const [saving, setSaving] = useState(false);
  const [scrapingAll, setScrapingAll] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<ReferenciaCuenta | null>(null);
  const [editForm, setEditForm] = useState({ categoria: "", notas: "" });

  async function addCuenta() {
    if (!form.username.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/referencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (res.ok && payload.data) {
        setCuentas((prev) => [payload.data as ReferenciaCuenta, ...prev]);
        setForm({ username: "", categoria: "", notas: "" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorita(cuenta: ReferenciaCuenta) {
    const favorita = !cuenta.favorita;
    setCuentas((prev) => prev.map((c) => (c.id === cuenta.id ? { ...c, favorita } : c)));
    await fetch(`/api/referencias/${cuenta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorita }),
    });
  }

  function openEdit(cuenta: ReferenciaCuenta) {
    setEditForm({ categoria: cuenta.categoria ?? "", notas: cuenta.notas ?? "" });
    setEditModal(cuenta);
  }

  async function saveEdit() {
    if (!editModal) return;
    const res = await fetch(`/api/referencias/${editModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      setCuentas((prev) => prev.map((c) => (c.id === editModal.id ? { ...c, ...editForm } : c)));
      setEditModal(null);
    }
  }

  async function deleteCuenta(cuenta: ReferenciaCuenta) {
    if (!window.confirm(`Eliminar @${cuenta.username} de las referencias?`)) return;
    const res = await fetch(`/api/referencias/${cuenta.id}`, { method: "DELETE" });
    if (res.ok) {
      setCuentas((prev) => prev.filter((c) => c.id !== cuenta.id));
    }
  }

  async function scrapeTodas() {
    setScrapingAll(true);
    try {
      const results = await Promise.all(
        cuentas.map(async (cuenta) => {
          const res = await fetch(`/api/referencias/${cuenta.id}/scrape`, { method: "POST" });
          return { id: cuenta.id, ok: res.ok };
        }),
      );
      setCuentas((prev) =>
        prev.map((c) => {
          const result = results.find((r) => r.id === c.id);
          return result?.ok ? { ...c, ultimo_scrape_at: null } : c;
        }),
      );
      setAviso(
        results.every((r) => r.ok)
          ? "Cuentas en cola: el runner las analiza en menos de 1 minuto. Los virales apareceran en Ideas virales."
          : "Alguna cuenta no se pudo poner en cola.",
      );
    } finally {
      setScrapingAll(false);
    }
  }

  return (
    <div className="space-y-5">
      <GlassCard className="p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-white">Anadir cuenta de referencia</h2>
        <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_1fr_auto] overflow-hidden">
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="usuario_ig"
            className="input-base min-w-0"
          />
          <input
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            placeholder="Categoria / nicho"
            className="input-base min-w-0"
          />
          <input
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            placeholder="Notas (opcional)"
            className="input-base min-w-0"
          />
          <button onClick={addCuenta} disabled={saving || !form.username.trim()} className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-40">
            {saving ? "Anadiendo..." : "Anadir"}
          </button>
        </div>
      </GlassCard>

      {cuentas.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">Sin cuentas de referencia todavia.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[color:var(--text-secondary)]">
              {cuentas.length} cuenta{cuentas.length === 1 ? "" : "s"} de referencia
            </p>
            <button
              onClick={scrapeTodas}
              disabled={scrapingAll}
              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scrapingAll ? "animate-spin" : ""}`} />
              {scrapingAll ? "Scrapeando todas..." : "Scrapear todas"}
            </button>
          </div>
          {aviso ? <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{aviso}</p> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {cuentas.map((cuenta) => (
            <GlassCard key={cuenta.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.05] text-sm font-semibold text-white/70">
                    {cuenta.username.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="truncate text-sm font-semibold text-white/90">@{cuenta.username}</span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 text-white/25">
                  <button
                    onClick={() => toggleFavorita(cuenta)}
                    className={`grid h-6 w-6 place-items-center rounded-md hover:bg-white/[0.06] ${cuenta.favorita ? "text-amber-400" : ""}`}
                    title="Favorita"
                  >
                    <Star className="h-3.5 w-3.5" fill={cuenta.favorita ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => openEdit(cuenta)}
                    className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/[0.06] hover:text-white/70"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteCuenta(cuenta)}
                    className="grid h-6 w-6 place-items-center rounded-md hover:bg-red-500/10 hover:text-red-400"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {cuenta.categoria ? <span className="badge mt-2.5 w-fit">{cuenta.categoria}</span> : null}

              <p className="mt-3 text-[11px] text-white/30">
                Ultimo analisis: {cuenta.ultimo_scrape_at ? formatDate(cuenta.ultimo_scrape_at) : "pendiente (en cola)"}
              </p>

              <a
                href={`https://instagram.com/${cuenta.username}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary mt-2 flex items-center justify-center gap-1.5 py-1.5 text-[11px]"
              >
                <ExternalLink className="h-3 w-3" /> Abrir en Instagram
              </a>
            </GlassCard>
          ))}
          </div>
        </>
      )}

      <div className="border-t border-white/[0.08] pt-5">
        <BancoReferenciasSection videos={bancoVideos} modelos={modelos} />
      </div>

      {editModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-semibold text-white">Editar @{editModal.username}</h2>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--text-secondary)]">
                Categoria
                <input value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })} className="input-base" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--text-secondary)]">
                Notas
                <textarea
                  value={editForm.notas}
                  onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })}
                  rows={3}
                  className="input-base resize-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditModal(null)} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              <button onClick={saveEdit} className="btn-primary px-4 py-2 text-sm">
                Guardar
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
