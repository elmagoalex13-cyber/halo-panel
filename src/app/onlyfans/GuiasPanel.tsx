"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { ETIQUETA_REFERENCIA, type CategoriaReferencia } from "@/lib/guiaOF";

type Ref = { id: string; categoria: CategoriaReferencia; titulo: string | null; nota: string | null; tipo_archivo: "foto" | "video"; vista: string | null };

const CATEGORIAS: CategoriaReferencia[] = ["post", "pack", "script_ejemplo"];

/** Guías y referencias que ven las modelos en su portal: textos de packs y posts, y fotos/vídeos de ejemplo. */
export function GuiasPanel() {
  const [abierto, setAbierto] = useState(false);
  const [pack, setPack] = useState("");
  const [post, setPost] = useState("");
  const [tablaTextos, setTablaTextos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [tablaRefs, setTablaRefs] = useState(true);
  const [categoria, setCategoria] = useState<CategoriaReferencia>("post");
  const [titulo, setTitulo] = useState("");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [g, r] = await Promise.all([fetch("/api/onlyfans/guias", { cache: "no-store" }), fetch("/api/onlyfans/referencias", { cache: "no-store" })]);
    if (g.ok) {
      const j = (await g.json()) as { pack: string; post: string; tablaLista: boolean };
      setPack(j.pack);
      setPost(j.post);
      setTablaTextos(j.tablaLista);
    }
    if (r.ok) {
      const j = (await r.json()) as { referencias: Ref[]; tablaLista: boolean };
      setRefs(j.referencias);
      setTablaRefs(j.tablaLista);
    }
  }, []);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  async function guardarTextos() {
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/onlyfans/guias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack, post }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? { ok: true, texto: "Guardado: ya lo ven las modelos en su portal" } : { ok: false, texto: j.error ?? "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  }

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setErrorSubida(null);
    for (const f of Array.from(files)) {
      setSubiendo(f.name);
      try {
        const firma = await fetch("/api/onlyfans/referencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "firmar", categoria, nombre: f.name, mime: f.type, size: f.size }) });
        const fj = (await firma.json().catch(() => ({}))) as { url?: string; key?: string; error?: string };
        if (!firma.ok || !fj.url || !fj.key) throw new Error(fj.error ?? "No se pudo preparar la subida");
        const put = await fetch(fj.url, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
        if (!put.ok) throw new Error(`La subida de ${f.name} falló (${put.status})`);
        const reg = await fetch("/api/onlyfans/referencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "registrar", categoria, key: fj.key, mime: f.type, titulo }) });
        const rj = (await reg.json().catch(() => ({}))) as { error?: string };
        if (!reg.ok) throw new Error(rj.error ?? "No se pudo guardar la referencia");
      } catch (e) {
        setErrorSubida(e instanceof Error ? e.message : "Error al subir");
        break;
      }
    }
    setSubiendo(null);
    setTitulo("");
    await cargar();
  }

  async function borrar(r: Ref) {
    if (!window.confirm("¿Quitar esta referencia? Las modelos dejarán de verla y se borra el archivo.")) return;
    const res = await fetch(`/api/onlyfans/referencias?id=${r.id}`, { method: "DELETE" });
    if (res.ok) setRefs((p) => p.filter((x) => x.id !== r.id));
  }

  return (
    <GlassCard className="mt-8 p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Guías y referencias para las modelos</h2>
          <p className="text-sm text-white/45">Lo que ven en su portal (pestaña «Guía»): indicaciones de packs y posts, y fotos/vídeos de ejemplo.</p>
        </div>
        <span className="text-white/50">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto ? (
        <div className="mt-5 space-y-6">
          <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/55">
            La <span className="font-semibold text-white/80">guía de scripts</span> ya está en su portal tal cual tu documento y no se puede cambiar desde aquí.
          </p>

          {!tablaTextos ? <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">Falta ejecutar el SQL <code>20261019_escala.sql</code> para guardar los textos.</p> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-white">Cómo son los packs de fotos</span>
              <textarea value={pack} onChange={(e) => setPack(e.target.value)} rows={9} placeholder="Escribe aquí las indicaciones de los packs (cuántas fotos, tipo de fotos, ropa, luz…). Una línea por indicación." className="input-base w-full resize-y text-sm" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-white">Cómo son los posts de OnlyFans</span>
              <textarea value={post} onChange={(e) => setPost(e.target.value)} rows={9} placeholder="Escribe aquí las indicaciones de los posts (cuántas fotos o vídeos, tono, texto…). Una línea por indicación." className="input-base w-full resize-y text-sm" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={guardarTextos} disabled={guardando || !tablaTextos} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
              {guardando ? "Guardando…" : "Guardar textos"}
            </button>
            {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</span> : null}
          </div>

          <div className="space-y-3 border-t border-white/[0.08] pt-5">
            <h3 className="text-sm font-semibold text-white">Referencias (fotos y vídeos de ejemplo)</h3>
            {!tablaRefs ? <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">Falta ejecutar el SQL <code>20261022_guias_y_objetivos.sql</code>.</p> : null}
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="block text-xs text-white/45">Para</span>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaReferencia)} className="input-base py-2 text-sm">
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_REFERENCIA[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[200px] flex-1 space-y-1">
                <span className="block text-xs text-white/45">Título o nota (opcional, lo ven ellas)</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} className="input-base w-full py-2 text-sm" placeholder="Ej.: Post con cara y escote" />
              </label>
              <label className={`btn-secondary cursor-pointer px-4 py-2 text-sm ${subiendo || !tablaRefs ? "pointer-events-none opacity-40" : ""}`}>
                {subiendo ? `Subiendo ${subiendo}…` : "Subir fotos o vídeos"}
                <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
            {errorSubida ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorSubida}</p> : null}

            {CATEGORIAS.map((c) => {
              const lista = refs.filter((r) => r.categoria === c);
              if (!lista.length) return null;
              return (
                <div key={c} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
                    {ETIQUETA_REFERENCIA[c]} · {lista.length}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {lista.map((r) => (
                      <div key={r.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        <div className="aspect-[3/4]">
                          {r.vista ? (
                            r.tipo_archivo === "video" ? (
                              <video src={r.vista} controls preload="metadata" className="h-full w-full object-cover" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.vista} alt={r.titulo ?? ""} className="h-full w-full object-cover" loading="lazy" />
                            )
                          ) : (
                            <div className="grid h-full place-items-center text-xs text-white/30">sin vista</div>
                          )}
                        </div>
                        {r.titulo ? <p className="truncate px-2 py-1 text-[11px] text-white/60">{r.titulo}</p> : null}
                        <button onClick={() => borrar(r)} className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-2 py-0.5 text-[11px] text-red-300 opacity-0 transition group-hover:opacity-100">
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
