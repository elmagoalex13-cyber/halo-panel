"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/GlassCard";
import { TIPOS_EDICION } from "@/lib/tiposEdicion";

export type EncargoRow = {
  id: string;
  tipo: number;
  estado: string;
  instrucciones: string | null;
  creado: string;
  modelo: string;
  url: string | null;
  descargado: boolean;
  tieneReferencia: boolean;
};

export function AsignarClient({ modelos, encargos }: { modelos: { id: string; nombre: string }[]; encargos: EncargoRow[] }) {
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [tipo, setTipo] = useState(4);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const lista = urls.split(/[\s,]+/).filter(Boolean);
  const exigeReferencia = tipo === 4;
  const tieneUrls = lista.length > 0;
  const alternar = (id: string) => setElegidas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function asignar() {
    setCargando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/asignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: lista, tipo, modelo_ids: elegidas, instrucciones: nota }),
      });
      const j = (await res.json()) as { error?: string; encargos?: number; ya_asignados?: number; urls?: number };
      if (!res.ok) throw new Error(j.error ?? "Error");
      setMsg({
        ok: true,
        texto: tieneUrls
          ? `${j.encargos} asignación(es) creada(s) con ${j.urls} URL(s)${j.ya_asignados ? ` · ${j.ya_asignados} ya estaban asignadas` : ""}. El runner las descarga en menos de 1 minuto.`
          : `${j.encargos} encargo(s) creado(s) para el portal${j.ya_asignados ? ` · ${j.ya_asignados} ya existían` : ""}.`,
      });
      setUrls("");
      setNota("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(id: string) {
    if (!confirm("¿Quitar este vídeo de la modelo?")) return;
    await fetch(`/api/asignar?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-5 p-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-white">
            URLs de video {exigeReferencia ? <span className="font-normal text-white/35">(obligatorio para tipo 4)</span> : <span className="font-normal text-white/35">(opcional)</span>}
          </label>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={5}
            placeholder={"Una URL por línea (o separadas por espacios/comas)\nhttps://www.instagram.com/reel/XXXX/\nhttps://www.instagram.com/reel/YYYY/"}
            className="input-base w-full resize-y font-code text-xs"
          />
          <p className="mt-1 text-xs text-white/35">
            {lista.length} URL detectada(s). En tipo 1, 2 y 3 puedes dejarlo vacio para crear solo una tarea.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-white">Tipo de edición</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TIPOS_EDICION.map((t) => (
              <button
                key={t.tipo}
                type="button"
                onClick={() => setTipo(t.tipo)}
                className={`rounded-xl border p-3 text-left transition ${
                  tipo === t.tipo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/15" : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <span className="block text-sm font-semibold text-white">
                  {t.tipo} · {t.nombre}
                </span>
                <span className="text-xs text-white/40">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Modelos ({elegidas.length} elegida(s))</p>
            <button
              type="button"
              onClick={() => setElegidas(elegidas.length === modelos.length ? [] : modelos.map((m) => m.id))}
              className="text-xs text-[#A78BFA] hover:underline"
            >
              {elegidas.length === modelos.length ? "Quitar todas" : "Elegir todas"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {modelos.length === 0 ? <p className="text-sm text-white/40">No hay modelos activas.</p> : null}
            {modelos.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => alternar(m.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  elegidas.includes(m.id) ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-white/[0.1] bg-white/[0.04] text-white/60 hover:text-white"
                }`}
              >
                {elegidas.includes(m.id) ? "✓ " : ""}
                {m.nombre}
              </button>
            ))}
          </div>
        </div>

        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Instrucciones para la modelo (opcional)" className="input-base w-full" />

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={asignar} disabled={cargando || (exigeReferencia && !lista.length) || !elegidas.length} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">
            {cargando ? "Asignando..." : exigeReferencia ? `Asignar ${lista.length || ""} vídeo(s)` : "Crear encargo"}
          </button>
          {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</p> : null}
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-white/[0.08] p-4">
          <h2 className="font-display text-lg font-semibold text-white">Asignados recientemente</h2>
        </div>
        {encargos.length === 0 ? (
          <p className="p-6 text-center text-sm text-white/35">Todavía no has asignado ningún vídeo.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {encargos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="w-28 shrink-0 font-medium text-white">{e.modelo}</span>
                <span className="badge shrink-0">Tipo {e.tipo}</span>
                <span className="min-w-0 flex-1 truncate font-code text-xs text-white/50">{e.url ?? "—"}</span>
                {e.tieneReferencia && !e.descargado ? <span className="text-[11px] text-amber-300">descargando…</span> : null}
                <span className={`badge shrink-0 ${e.estado === "entregado" ? "badge-aprobado" : "badge-editando"}`}>
                  {e.estado === "entregado" ? "Entregado" : "Pendiente"}
                </span>
                {e.estado !== "entregado" ? (
                  <button onClick={() => cancelar(e.id)} className="text-xs text-white/30 hover:text-red-400">
                    Quitar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
