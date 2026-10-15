"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TEMAS_CAPTION } from "@/lib/captionTemas";

type Tipo = "foto" | "propina" | "encuesta" | "plantilla";
type Caption = { id: string; texto: string; tipo: Tipo; activa: boolean; tags: string[]; origen: string };

const TIPOS: Array<{ id: Tipo; etiqueta: string; ayuda: string }> = [
  { id: "foto", etiqueta: "Para foto", ayuda: "Caption normal para un post con foto" },
  { id: "propina", etiqueta: "Pide propina", ayuda: "Pide un tip u objetivo: solo para posts de pago" },
  { id: "encuesta", etiqueta: "Encuesta", ayuda: "Lleva opciones: hay que prepararla a mano" },
  { id: "plantilla", etiqueta: "Plantilla", ayuda: "Tiene [huecos] que rellenar antes de usarla" },
];
const POR_PAGINA = 40;

/** Banco de captions para los posts de OnlyFans: importar el documento, buscar, editar, activar o desactivar. */
export function CaptionsClient() {
  const [lista, setLista] = useState<Caption[] | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<Tipo | "todos">("todos");
  const [tema, setTema] = useState("todos");
  const [estado, setEstado] = useState<"todos" | "activas" | "apagadas">("todos");
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/captions", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { captions?: Caption[]; error?: string; sinTabla?: boolean };
    setSinTabla(Boolean(j.sinTabla));
    setError(r.ok ? null : (j.error ?? "No se pudieron cargar"));
    setLista(j.captions ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter((c) => (tipo === "todos" || c.tipo === tipo) && (tema === "todos" || (tema === "sin" ? !c.tags.some((t) => TEMAS_CAPTION.some((x) => x.id === t)) : c.tags.includes(tema))) && (estado === "todos" || (estado === "activas" ? c.activa : !c.activa)) && (!q || c.texto.toLowerCase().includes(q)));
  }, [lista, busca, tipo, tema, estado]);
  useEffect(() => setPagina(0), [busca, tipo, tema, estado]);

  const cuenta = (f: (c: Caption) => boolean) => (lista ?? []).filter(f).length;
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pagActual = visibles.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  async function importar() {
    setTrabajando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/captions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "importar_base" }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; nuevos?: number; total?: number; etiquetados?: number };
      if (!r.ok) throw new Error(j.error ?? "No se pudo importar");
      setMsg({ ok: true, texto: `${j.nuevos ? `Importados ${j.nuevos} captions del documento.` : "No hay captions nuevos en el documento."}${j.etiquetados ? ` Temas puestos a ${j.etiquetados} captions que ya estaban.` : ""}` });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiar(id: string, cambios: Partial<Pick<Caption, "texto" | "tipo" | "activa" | "tags">>) {
    setLista((p) => (p ?? []).map((c) => (c.id === id ? { ...c, ...cambios } : c)));
    const r = await fetch(`/api/captions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg({ ok: false, texto: j.error ?? "No se pudo guardar" });
      await cargar();
    }
  }

  async function borrar(c: Caption) {
    if (!confirm("¿Borrar este caption?")) return;
    setLista((p) => (p ?? []).filter((x) => x.id !== c.id));
    await fetch(`/api/captions/${c.id}`, { method: "DELETE" });
  }

  async function agregar() {
    if (!nuevo.trim()) return;
    const r = await fetch("/api/captions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "agregar", texto: nuevo }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; caption?: Caption };
    if (!r.ok || !j.caption) return setMsg({ ok: false, texto: j.error ?? "No se pudo añadir" });
    setLista((p) => [...(p ?? []), j.caption as Caption]);
    setNuevo("");
    setMsg({ ok: true, texto: "Caption añadido." });
  }

  if (lista === null) return <p className="text-sm text-white/40">Cargando…</p>;

  if (sinTabla) {
    return <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Falta ejecutar el SQL <code>20261025_captions.sql</code> en Supabase (está al final de <code>EJECUTAR_EN_SUPABASE.sql</code>). Después recarga esta página.</p>;
  }

  return (
    <div className="space-y-4">
      {!lista.length ? (
        <div className="rounded-2xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 p-5">
          <p className="font-semibold text-white">Aún no hay captions</p>
          <p className="mt-1 text-sm text-white/60">Importa tu documento de captions (unos 1.100): se limpian los repetidos y se marcan aparte las encuestas, las plantillas con [huecos] y los que piden propina.</p>
          <button onClick={importar} disabled={trabajando} className="btn-primary mt-3 px-5 py-2.5 text-sm disabled:opacity-50">
            {trabajando ? "Importando…" : "Importar el documento de captions"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Resumen etiqueta="Total" valor={lista.length} />
          <Resumen etiqueta="Activos" valor={cuenta((c) => c.activa)} color="text-emerald-300" />
          {TIPOS.slice(1).map((t) => (
            <Resumen key={t.id} etiqueta={t.etiqueta} valor={cuenta((c) => c.tipo === t.id)} />
          ))}
        </div>
      )}
      {lista.length && (lista.some((c) => c.origen === "documento" && !c.tags.length) || !lista.some((c) => c.tags.includes("culo"))) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 px-4 py-3">
          <p className="text-sm text-white/70">Faltan captions del documento o sus temas (cada pestaña del documento es un tema: Culo, Tetas, Mañana, Noche, Fitness, Piscina/Playa…). Se importan solos y luego puedes corregir cualquiera a mano.</p>
          <button onClick={importar} disabled={trabajando} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
            {trabajando ? "Importando…" : "Importar temas del documento"}
          </button>
        </div>
      ) : null}
      {error && !sinTabla ? <p className="text-sm text-red-300">{error}</p> : null}
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</p> : null}

      {lista.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en los captions…" className="input-base min-w-52 flex-1 text-sm" />
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo | "todos")} className="input-base py-2 text-sm">
              <option value="todos">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>{t.etiqueta}</option>
              ))}
            </select>
            <select value={tema} onChange={(e) => setTema(e.target.value)} className="input-base py-2 text-sm" aria-label="Tema">
              <option value="todos">Todos los temas</option>
              {TEMAS_CAPTION.map((t) => (
                <option key={t.id} value={t.id}>{t.etiqueta} ({cuenta((c) => c.tags.includes(t.id))})</option>
              ))}
              <option value="sin">Sin tema</option>
            </select>
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="input-base py-2 text-sm">
              <option value="todos">Activos y apagados</option>
              <option value="activas">Solo activos</option>
              <option value="apagadas">Solo apagados</option>
            </select>
          </div>

          <div className="flex gap-2">
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Añadir un caption nuevo…" className="input-base flex-1 text-sm" onKeyDown={(e) => e.key === "Enter" && void agregar()} />
            <button onClick={agregar} disabled={!nuevo.trim()} className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
              Añadir
            </button>
          </div>

          <p className="text-xs text-white/40">Cada caption tiene un <b className="text-white/60">tema</b> (cada pestaña de tu documento: Culo, Tetas, Mañana, Noche, Fitness, Piscina/Playa…): en «Programar posts» eliges el tema de la foto y el caption sale de ese tema. {visibles.length} {visibles.length === 1 ? "caption" : "captions"} · se usan para programar posts solo los <b className="text-white/60">activos de tipo «Para foto»</b> (los que piden propina, las encuestas y las plantillas se reservan).</p>

          <ul className="space-y-2">
            {pagActual.map((c) => (
              <li key={c.id} className={`rounded-xl border p-3 ${c.activa ? "border-white/[0.08] bg-white/[0.03]" : "border-white/[0.05] bg-white/[0.015] opacity-70"}`}>
                {editando === c.id ? (
                  <div className="space-y-2">
                    <textarea value={borrador} onChange={(e) => setBorrador(e.target.value)} rows={3} className="input-base w-full resize-y text-sm" autoFocus />
                    <div className="flex gap-2">
                      <button onClick={() => { void cambiar(c.id, { texto: borrador.trim() }); setEditando(null); }} className="btn-primary px-3 py-1.5 text-xs">Guardar</button>
                      <button onClick={() => setEditando(null)} className="btn-secondary px-3 py-1.5 text-xs">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-white/85">{c.texto}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <select value={c.tipo} onChange={(e) => void cambiar(c.id, { tipo: e.target.value as Tipo })} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/70">
                    {TIPOS.map((t) => (
                      <option key={t.id} value={t.id}>{t.etiqueta}</option>
                    ))}
                  </select>
                  <select
                    value={c.tags.find((t) => TEMAS_CAPTION.some((x) => x.id === t)) ?? ""}
                    onChange={(e) => void cambiar(c.id, { tags: [...c.tags.filter((t) => !TEMAS_CAPTION.some((x) => x.id === t)), ...(e.target.value ? [e.target.value] : [])] })}
                    className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/70"
                    aria-label="Tema del caption"
                  >
                    <option value="">Sin tema</option>
                    {TEMAS_CAPTION.map((t) => (
                      <option key={t.id} value={t.id}>{t.etiqueta}</option>
                    ))}
                  </select>
                  <span className="ml-auto flex gap-3">
                    <button onClick={() => void cambiar(c.id, { activa: !c.activa })} className={`font-semibold hover:underline ${c.activa ? "text-emerald-300" : "text-white/40"}`}>
                      {c.activa ? "● Activo" : "○ Apagado"}
                    </button>
                    <button onClick={() => { setEditando(c.id); setBorrador(c.texto); }} className="font-semibold text-[#A78BFA] hover:underline">Editar</button>
                    <button onClick={() => void borrar(c)} className="font-semibold text-red-300/70 hover:text-red-300 hover:underline">Borrar</button>
                  </span>
                </div>
              </li>
            ))}
            {!pagActual.length ? <li className="p-6 text-center text-sm text-white/35">Ningún caption con esos filtros.</li> : null}
          </ul>

          {paginas > 1 ? (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="btn-secondary px-3 py-1.5 disabled:opacity-30">← Anterior</button>
              <span className="text-white/50">Página {pagina + 1} de {paginas}</span>
              <button onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))} disabled={pagina >= paginas - 1} className="btn-secondary px-3 py-1.5 disabled:opacity-30">Siguiente →</button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Resumen({ etiqueta, valor, color = "text-white" }: { etiqueta: string; valor: number; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-white/35">{etiqueta}</p>
      <p className={`font-display text-2xl font-semibold ${color}`}>{valor}</p>
    </div>
  );
}
