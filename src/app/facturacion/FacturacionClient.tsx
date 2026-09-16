"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/Badge";
import { GlassCard } from "@/components/GlassCard";
import { formatCurrency } from "@/lib/utils";
import type { FacturacionModelo, Modelo } from "@/types";

export function FacturacionClient({
  rows: initialRows,
  modelos,
}: {
  rows: FacturacionModelo[];
  modelos: Modelo[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState({
    modelo_id: modelos[0]?.id ?? "",
    modelo_nombre: modelos[0]?.nombre ?? "",
    periodo_inicio: "",
    periodo_fin: "",
    ingresos_brutos: "",
    porcentaje_comision: "30",
    notas: "",
  });

  const totalBruto = rows.reduce((s, r) => s + Number(r.ingresos_brutos), 0);
  const totalComision = rows.reduce((s, r) => s + Number(r.comision_agencia), 0);
  const totalNeto = rows.reduce((s, r) => s + Number(r.neto_modelo), 0);

  function handleModeloChange(id: string) {
    const m = modelos.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      modelo_id: id,
      modelo_nombre: m?.nombre ?? "",
      porcentaje_comision: String(m?.porcentaje_comision ?? 30),
    }));
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/facturacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ingresos_brutos: Number(form.ingresos_brutos),
          porcentaje_comision: Number(form.porcentaje_comision),
        }),
      });
      if (res.ok) {
        setShowForm(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function marcarCobrado(row: FacturacionModelo) {
    setMarkingId(row.id);
    try {
      const ya_cobrado = row.estado_cobro === "cobrado";
      const res = await fetch(`/api/facturacion/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado_cobro: ya_cobrado ? "pendiente" : "cobrado",
          cobrado_en: ya_cobrado ? null : new Date().toISOString(),
          fecha_cobro: ya_cobrado ? null : new Date().toISOString().split("T")[0],
        }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, estado_cobro: ya_cobrado ? "pendiente" : "cobrado", fecha_cobro: ya_cobrado ? null : new Date().toISOString().split("T")[0] }
              : r
          )
        );
      }
    } finally {
      setMarkingId(null);
    }
  }

  async function eliminar(id: string) {
    if (deleteConfirmId !== id) { setDeleteConfirmId(id); return; }
    setDeleteConfirmId(null);
    const res = await fetch(`/api/facturacion/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-sm text-[color:var(--text-secondary)]">Total ingresos</p>
          <p className="mt-2 text-2xl font-semibold text-[color:var(--accent)]">{formatCurrency(totalBruto)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-sm text-[color:var(--text-secondary)]">Total comision</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totalComision)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-sm text-[color:var(--text-secondary)]">Total neto modelos</p>
          <p className="mt-2 text-2xl font-semibold text-teal-400">{formatCurrency(totalNeto)}</p>
        </div>
      </div>

      {/* Form nueva entrada */}
      {showForm && (
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-4">Nuevo registro de facturación</h3>
          <form onSubmit={submitForm} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">Modelo</label>
              <select
                value={form.modelo_id}
                onChange={(e) => handleModeloChange(e.target.value)}
                className="input-base w-full"
                required
              >
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">Ingresos brutos (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-base w-full"
                value={form.ingresos_brutos}
                onChange={(e) => setForm((f) => ({ ...f, ingresos_brutos: e.target.value }))}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">Periodo inicio</label>
              <input
                type="date"
                className="input-base w-full"
                value={form.periodo_inicio}
                onChange={(e) => setForm((f) => ({ ...f, periodo_inicio: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">Periodo fin</label>
              <input
                type="date"
                className="input-base w-full"
                value={form.periodo_fin}
                onChange={(e) => setForm((f) => ({ ...f, periodo_fin: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">% Comisión agencia</label>
              <input
                type="number"
                min="0"
                max="100"
                className="input-base w-full"
                value={form.porcentaje_comision}
                onChange={(e) => setForm((f) => ({ ...f, porcentaje_comision: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">Notas</label>
              <input
                type="text"
                className="input-base w-full"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                {saving ? "Guardando..." : "Guardar registro"}
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Tabla */}
      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
          <p className="text-sm text-[color:var(--text-secondary)]">{rows.length} registros</p>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm">
            <Plus className="h-3.5 w-3.5" /> Registrar factura
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-white/[0.08] text-[color:var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3 font-medium">Modelo</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Ingresos brutos</th>
                <th className="px-4 py-3 font-medium">%</th>
                <th className="px-4 py-3 font-medium">Comision</th>
                <th className="px-4 py-3 font-medium">Neto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[color:var(--text-secondary)]">
                    Sin registros de facturación. Añade el primero o sincroniza con Venuz.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-4 font-medium text-white">{row.modelo_nombre}</td>
                  <td className="px-4 py-4 text-[color:var(--text-secondary)] text-xs">
                    {row.periodo_inicio ? new Date(row.periodo_inicio).toLocaleDateString("es-ES") : "-"}
                    {row.periodo_fin ? ` — ${new Date(row.periodo_fin).toLocaleDateString("es-ES")}` : ""}
                  </td>
                  <td className="px-4 py-4 text-white">{formatCurrency(Number(row.ingresos_brutos))}</td>
                  <td className="px-4 py-4 text-[color:var(--text-secondary)]">{row.porcentaje_comision}%</td>
                  <td className="px-4 py-4 text-white">{formatCurrency(Number(row.comision_agencia))}</td>
                  <td className="px-4 py-4 text-white">{formatCurrency(Number(row.neto_modelo))}</td>
                  <td className="px-4 py-4"><Badge status={row.estado_cobro} /></td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => marcarCobrado(row)}
                        disabled={markingId === row.id}
                        title={row.estado_cobro === "cobrado" ? "Marcar pendiente" : "Marcar cobrado"}
                        className={`rounded-md border p-1.5 text-xs transition-colors disabled:opacity-40 ${
                          row.estado_cobro === "cobrado"
                            ? "border-green-500/30 bg-green-500/15 text-green-400"
                            : "border-white/10 bg-white/5 text-white/50 hover:border-green-500/30 hover:text-green-400"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => eliminar(row.id)}
                        title={deleteConfirmId === row.id ? "Confirmar eliminación" : "Eliminar registro"}
                        className={`rounded-md border p-1.5 transition-colors ${deleteConfirmId === row.id ? "border-red-500/50 bg-red-500/20 text-red-400" : "border-white/10 bg-white/5 text-white/30 hover:border-red-500/30 hover:text-red-400"}`}
                        onBlur={() => setDeleteConfirmId(null)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
