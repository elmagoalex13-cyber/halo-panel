"use client";

import { useState } from "react";
import type { NotaModelo } from "@/lib/notasModelo";

const cuando = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/** Anotaciones internas de la modelo, para los dos (socio y dueño): quedan con quien las escribió y cuándo. Las fijadas salen arriba. */
export function NotasModelo({ modeloId, nombre, iniciales }: { modeloId: string; nombre: string; iniciales: NotaModelo[] }) {
  const [notas, setNotas] = useState(iniciales);
  const [texto, setTexto] = useState("");
  const [fijar, setFijar] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function llamar(metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>, query = "") {
    setTrabajando(true);
    setError(null);
    try {
      const res = await fetch(`/api/modelos/${modeloId}/notas${query}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      const j = (await res.json().catch(() => ({}))) as { error?: string; notas?: NotaModelo[] };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
      if (j.notas) setNotas(j.notas);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      return false;
    } finally {
      setTrabajando(false);
    }
  }

  async function añadir() {
    if (!texto.trim()) return;
    if (await llamar("POST", { texto, fijada: fijar })) {
      setTexto("");
      setFijar(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card !p-4">
        <p className="text-sm font-semibold text-halo-text">Notas internas de {nombre}</p>
        <p className="mt-0.5 text-xs text-halo-subtle">Solo las veis tu socio y tú (ella no).</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Nueva nota: grupo de WhatsApp, acuerdos, cosas a tener en cuenta…"
          className="input-base mt-3 w-full resize-y text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={() => void añadir()} disabled={trabajando || !texto.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
            Añadir nota
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-halo-subtle">
            <input type="checkbox" checked={fijar} onChange={(e) => setFijar(e.target.checked)} className="h-4 w-4 accent-[#8B5CF6]" />
            📌 Fijarla arriba del todo
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      </div>

      {notas.length ? (
        <ul className="space-y-2">
          {notas.map((n) => (
            <li key={n.id} className={`card !p-3 ${n.fijada ? "ring-1 ring-amber-300/40" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-halo-subtle">
                {n.fijada ? <span className="rounded-full bg-amber-300/15 px-2 py-0.5 font-semibold text-amber-200">📌 Fijada</span> : null}
                <span className="font-semibold text-halo-text">{n.autor}</span>
                <span>{cuando(n.creada)}</span>
                {n.editada ? <span className="opacity-70">(editada)</span> : null}
              </div>
              {editando === n.id ? (
                <div className="mt-2 space-y-2">
                  <textarea value={borrador} onChange={(e) => setBorrador(e.target.value)} rows={3} maxLength={2000} className="input-base w-full resize-y text-sm" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={async () => { if (await llamar("PATCH", { nota_id: n.id, texto: borrador })) setEditando(null); }} disabled={trabajando || !borrador.trim()} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">
                      Guardar
                    </button>
                    <button onClick={() => setEditando(null)} className="btn-secondary px-3 py-1.5 text-xs">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-halo-text">{n.texto}</p>
              )}
              {editando !== n.id ? (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button onClick={() => void llamar("PATCH", { nota_id: n.id, fijada: !n.fijada })} disabled={trabajando} className="font-semibold text-halo-subtle hover:text-halo-text hover:underline">
                    {n.fijada ? "Quitar de fijadas" : "📌 Fijar"}
                  </button>
                  <button onClick={() => { setEditando(n.id); setBorrador(n.texto); }} className="font-semibold text-[#A78BFA] hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => confirm("¿Borrar esta nota?") && void llamar("DELETE", undefined, `?nota_id=${n.id}`)}
                    disabled={trabajando}
                    className="font-semibold text-red-300/70 hover:text-red-300 hover:underline"
                  >
                    Borrar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="card !p-4 text-sm text-halo-subtle">Todavía no hay notas de {nombre}.</p>
      )}
    </div>
  );
}
