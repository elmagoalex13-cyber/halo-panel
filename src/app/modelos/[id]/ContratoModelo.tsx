"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ContratoFicha = { id: string; nombre: string; estado: string; fecha_inicio: string; firmado_at: string | null; created_at: string; nombre_firmante?: string | null };

const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }) : "");

const ESTADO: Record<string, string> = { enviado: "Enviado, pendiente de firma", visto: "Abierto, pendiente de firma", firmado: "Firmado", cancelado: "Cancelado" };

/** Mini hoja del contrato: se ve de un vistazo si esta firmado y por quien (las dos firmas), sin abrir el PDF. */
function PreviewContrato({ c }: { c: ContratoFicha }) {
  const firmado = c.estado === "firmado";
  return (
    <a
      href={`/api/contratos/${c.id}/pdf`}
      target="_blank"
      rel="noreferrer"
      title="Abrir el contrato (PDF)"
      className="group relative block h-52 w-40 shrink-0 overflow-hidden rounded-md bg-[#f6f3ea] p-3 text-[#2b2540] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-black/20 transition-transform hover:-translate-y-0.5"
    >
      <p className="text-center text-[8px] font-bold uppercase tracking-[0.12em]">Contrato de representación</p>
      <p className="mt-0.5 text-center text-[7px] text-[#2b2540]/60">Halo Models · {c.nombre}</p>
      <div className="mt-2 space-y-1">
        {[100, 92, 96, 70, 100, 88, 94, 60].map((w, i) => (
          <div key={i} className="h-[3px] rounded-full bg-[#2b2540]/15" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2">
        {(["agencia", "modelo"] as const).map((quien) => (
          <div key={quien} className="text-center">
            <div className="grid h-9 place-items-center rounded-sm border-b border-[#2b2540]/30">
              {quien === "agencia" || firmado ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/contratos/${c.id}/firma?quien=${quien}`} alt={`Firma ${quien}`} className="max-h-8 max-w-full object-contain" />
              ) : (
                <span className="text-[7px] italic text-[#2b2540]/40">sin firmar</span>
              )}
            </div>
            <p className="mt-0.5 text-[6px] uppercase tracking-wide text-[#2b2540]/55">{quien === "agencia" ? "Agencia" : "Modelo"}</p>
          </div>
        ))}
      </div>
      <span
        className={`absolute right-1 top-[4.6rem] -rotate-12 rounded border-2 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${firmado ? "border-emerald-600/70 text-emerald-700/80" : "border-amber-600/70 text-amber-700/80"}`}
      >
        {firmado ? "Firmado" : "Pendiente"}
      </span>
      <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">Abrir PDF</span>
    </a>
  );
}

/** Pestana «Contrato» de la ficha: el contrato de la modelo con su vista previa y botones claros, y si no hay ninguno ligado, elegir uno. */
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
        <ul className="space-y-3">
          {contratos.map((c) => {
            const firmado = c.estado === "firmado";
            return (
              <li key={c.id} className="card flex flex-wrap items-start gap-5 !p-4">
                <PreviewContrato c={c} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="font-semibold text-halo-text">Contrato con Halo Models</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${firmado ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-300/15 text-amber-100"}`}>
                      {firmado ? "✅ Firmado" : (ESTADO[c.estado] ?? c.estado)}
                    </span>
                  </div>
                  <dl className="space-y-0.5 text-sm text-halo-subtle">
                    <div>
                      <dt className="inline">A nombre de: </dt>
                      <dd className="inline text-halo-text">{c.nombre}</dd>
                    </div>
                    {firmado ? (
                      <>
                        <div>
                          <dt className="inline">Firmado el: </dt>
                          <dd className="inline text-halo-text">{cuando(c.firmado_at)}</dd>
                        </div>
                        {c.nombre_firmante ? (
                          <div>
                            <dt className="inline">Firmado por: </dt>
                            <dd className="inline text-halo-text">{c.nombre_firmante}</dd>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div>
                        <dt className="inline">Fecha de inicio: </dt>
                        <dd className="inline text-halo-text">{cuando(c.fecha_inicio)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/contratos/${c.id}/pdf`} target="_blank" rel="noreferrer" className="btn-primary px-4 py-2 text-sm">
                      Abrir contrato
                    </a>
                    <a href={`/api/contratos/${c.id}/pdf?descargar=1`} className="btn-secondary px-4 py-2 text-sm">
                      ↓ Descargar PDF
                    </a>
                  </div>
                  <button
                    onClick={() => confirm("¿Quitar este contrato de la ficha? El contrato no se borra: sigue en la página Contratos.") && void vincular(c.id, null)}
                    className="text-xs text-halo-subtle/70 hover:text-halo-text hover:underline"
                  >
                    Quitar de esta ficha
                  </button>
                </div>
              </li>
            );
          })}
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
