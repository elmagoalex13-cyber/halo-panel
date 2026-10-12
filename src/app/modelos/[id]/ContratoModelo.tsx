"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ContratoFicha = { id: string; nombre: string; estado: string; fecha_inicio: string; firmado_at: string | null; created_at: string };

const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }) : "");

const ESTADO: Record<string, string> = { enviado: "Enviado, pendiente de firma", visto: "Abierto, pendiente de firma", firmado: "Firmado ✅", cancelado: "Cancelado" };

/** Pestana «Contrato» de la ficha: el contrato firmado de la modelo (PDF para ver o descargar) y, si no hay ninguno ligado, elegir uno de la lista. */
export function ContratoModelo({ modeloId, nombre, contratos, disponibles }: { modeloId: string; nombre: string; contratos: ContratoFicha[]; disponibles: ContratoFicha[] }) {
  const router = useRouter();
  const [elegido, setElegido] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function vincular(id: string, destino: string | null) {
    setMsg(null);
    const res = await fetch(`/api/contratos/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "vincular", modelo_id: destino }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMsg(j.error ?? "No se pudo");
    setElegido("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {contratos.length ? (
        <ul className="space-y-2">
          {contratos.map((c) => (
            <li key={c.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 !p-4">
              <div className="min-w-0">
                <p className="font-semibold text-halo-text">Contrato con Halo Models</p>
                <p className="text-xs text-halo-subtle">
                  {c.estado === "firmado" ? `Firmado el ${cuando(c.firmado_at)}` : ESTADO[c.estado] ?? c.estado} · a nombre de {c.nombre}
                </p>
              </div>
              <span className="ml-auto flex flex-wrap items-center gap-3 text-sm">
                <a href={`/api/contratos/${c.id}/pdf`} target="_blank" rel="noreferrer" className="font-semibold text-[#A78BFA] hover:underline">
                  Ver PDF
                </a>
                <a href={`/api/contratos/${c.id}/pdf?descargar=1`} className="font-semibold text-halo-subtle hover:text-halo-text hover:underline">
                  Descargar
                </a>
                <button onClick={() => void vincular(c.id, null)} className="text-xs text-halo-subtle hover:text-halo-text hover:underline" title="Quita el contrato de esta ficha (el contrato se conserva en la página Contratos)">
                  Quitar de esta ficha
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card !p-4 text-sm text-halo-subtle">{nombre} no tiene ningún contrato ligado todavía.</p>
      )}

      {disponibles.length ? (
        <div className="card !p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-halo-subtle">Ligar un contrato a esta modelo</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={elegido} onChange={(e) => setElegido(e.target.value)} className="input-base max-w-xs">
              <option value="">Elige un contrato…</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.estado === "firmado" ? `firmado ${cuando(c.firmado_at)}` : "sin firmar"}
                </option>
              ))}
            </select>
            <button disabled={!elegido} onClick={() => void vincular(elegido, modeloId)} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
              Ligar
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="text-sm text-red-300">{msg}</p> : null}
      <p className="text-xs text-halo-subtle">
        Todos los contratos están en la página <a href="/contratos" className="underline hover:text-halo-text">Contratos</a>, donde se guarda una copia de cada firmado.
      </p>
    </div>
  );
}
