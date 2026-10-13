"use client";

import { useCallback, useEffect, useState } from "react";
import { TEMAS_CAPTION } from "@/lib/captionTemas";
import { VisorFotos } from "@/components/VisorFotos";

type Post = {
  id: string;
  caption: string | null;
  caption_motivo: string | null;
  estado: "borrador" | "aprobado" | "programado" | "publicado" | "error";
  programar_para: string | null;
  error: string | null;
  aprobado_por: string | null;
  vista: string | null;
};
type ModeloPosts = { id: string; nombre: string; cada_dias: number; venuz_activo: boolean; fan_baul: string; nuevas: number; posts: Post[] };

const ESTADO: Record<Post["estado"], { texto: string; clase: string }> = {
  borrador: { texto: "Por revisar", clase: "bg-amber-300/15 text-amber-100" },
  aprobado: { texto: "Aprobado", clase: "bg-emerald-400/20 text-emerald-200" },
  programado: { texto: "En la cola de Venuz", clase: "bg-sky-400/20 text-sky-200" },
  publicado: { texto: "Publicado", clase: "bg-white/10 text-white/50" },
  error: { texto: "Error", clase: "bg-red-400/20 text-red-200" },
};

// datetime-local trabaja en hora local del navegador; los huecos estan pensados en hora de Madrid, asi que se muestran siempre en Madrid
const aMadrid = (iso: string | null) => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).replace(" ", "T").slice(0, 16) : "");
const deMadrid = (local: string) => {
  // local = "YYYY-MM-DDTHH:mm" en hora de Madrid -> instante UTC
  const [f, h] = local.split("T");
  const [y, m, d] = f.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const v = new Date(t).toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).replace(" ", "T").slice(0, 16);
    const [vf, vh] = v.split("T");
    const [vy, vm, vd] = vf.split("-").map(Number);
    const [vhh, vmm] = vh.split(":").map(Number);
    t -= Date.UTC(vy, vm - 1, vd, vhh, vmm) - Date.UTC(y, m - 1, d, hh, mm);
  }
  return new Date(t).toISOString();
};
const bonita = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "sin fecha");

/** Posts de OnlyFans por programar: el caption sale de tu banco y el hueco lo pone el panel; tu revisas, editas y apruebas. */
export function PostsOfClient() {
  const [modelos, setModelos] = useState<ModeloPosts[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ modelo: string; i: number } | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/posts-of", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { modelos?: ModeloPosts[]; error?: string; sinTabla?: boolean };
    setSinTabla(Boolean(j.sinTabla));
    setError(r.ok ? null : (j.error ?? "No se pudo cargar"));
    setModelos(j.modelos ?? []);
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porAprobar = (m: ModeloPosts) => m.posts.filter((p) => p.estado === "borrador" && p.caption?.trim() && p.programar_para && new Date(p.programar_para).getTime() > Date.now() + 11 * 60000).length;

  async function preparar(m: ModeloPosts) {
    setTrabajando(m.id);
    setMsg(null);
    try {
      let total = 0;
      for (let vuelta = 0; vuelta < 40; vuelta++) {
        const r = await fetch("/api/posts-of", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "preparar", modelo_id: m.id }) });
        const j = (await r.json().catch(() => ({}))) as { error?: string; creados?: number; restantes?: number };
        if (!r.ok) throw new Error(j.error ?? "No se pudo preparar");
        total += j.creados ?? 0;
        await cargar();
        if (!j.restantes || !j.creados) break;
      }
      setMsg({ ok: true, texto: total ? `${total} ${total === 1 ? "post preparado" : "posts preparados"} para ${m.nombre}.` : `${m.nombre} no tiene fotos nuevas en «Posts».` });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setTrabajando(null);
    }
  }

  async function ajustes(m: ModeloPosts, cambios: { cada_dias?: number; venuz_activo?: boolean; fan_baul?: string }) {
    setModelos((p) => (p ?? []).map((x) => (x.id === m.id ? { ...x, ...cambios } : x)));
    await fetch("/api/posts-of", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "ajustes", modelo_id: m.id, ...cambios }) });
  }

  // Aprueba de golpe todos los posts por revisar que ya tienen caption y una fecha futura
  async function aprobarTodos(m: ModeloPosts) {
    const lista = m.posts.filter((p) => p.estado === "borrador" && p.caption?.trim() && p.programar_para && new Date(p.programar_para).getTime() > Date.now() + 11 * 60000);
    if (!lista.length) return;
    const aviso = m.venuz_activo ? "Se enviarán a la cola de Venuz en uno o dos minutos." : "«Enviar a Venuz» está desactivado para esta modelo: solo quedarán aprobados aquí.";
    if (!confirm(`¿Aprobar los ${lista.length} posts de ${m.nombre}? ${aviso}`)) return;
    setTrabajando(m.id);
    let fallos = 0;
    for (const p of lista) {
      const r = await fetch(`/api/posts-of/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "aprobado" }) });
      if (!r.ok) fallos++;
    }
    await cargar();
    setTrabajando(null);
    setMsg(fallos ? { ok: false, texto: `${lista.length - fallos} aprobados; ${fallos} no se pudieron aprobar (revisa su fecha o su caption).` } : { ok: true, texto: `${lista.length} posts de ${m.nombre} aprobados.` });
  }

  async function guardar(id: string, cambios: Record<string, unknown>) {
    const r = await fetch(`/api/posts-of/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) setMsg({ ok: false, texto: j.error ?? "No se pudo guardar" });
    await cargar();
    return r.ok;
  }

  // Tema elegido para cada post (piscina/playa, culo, gym…): el caption nuevo sale de ese tema. Vacio = cualquiera.
  const [temas, setTemas] = useState<Record<string, string>>({});

  async function regenerar(id: string, tema?: string) {
    setTrabajando(id);
    setMsg(null);
    const r = await fetch(`/api/posts-of/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "regenerar", tema: (tema ?? temas[id]) || undefined }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) setMsg({ ok: false, texto: j.error ?? "No se pudo generar" });
    await cargar();
    setTrabajando(null);
  }

  if (modelos === null) return <p className="text-sm text-white/40">Cargando…</p>;
  if (sinTabla) return <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Falta ejecutar el SQL <code>20261025_posts_programados.sql</code> en Supabase (está al final de <code>EJECUTAR_EN_SUPABASE.sql</code>). Después recarga esta página.</p>;

  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/60">
        Las fotos de la carpeta «Posts» de cada modelo con perfil activo en Venuz se convierten aquí en posts: el <b className="text-white/80">caption</b> sale de tu banco de captions y el <b className="text-white/80">día y la hora</b> (entre las 8:00 y las 19:00, hora de Madrid). Tú revisas y apruebas. Al <b className="text-white/80">aprobar</b> un post de una modelo con «Enviar a Venuz» activado, el editor lo sube al baúl y lo programa en la cola de Venuz (en uno o dos minutos). Si no está activado, el post solo queda aprobado aquí.
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</p> : null}
      {!modelos.length ? <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/40">No hay modelos con un perfil activo en Venuz vinculado. Se vinculan desde Facturación.</p> : null}

      {modelos.map((m) => {
        const porRevisar = m.posts.filter((p) => p.estado === "borrador").length;
        const aprobados = m.posts.filter((p) => p.estado === "aprobado" || p.estado === "programado").length;
        const visibles = m.posts.filter((p) => p.vista);
        return (
          <section key={m.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-white">{m.nombre}</h2>
              <span className="text-xs text-white/40">{porRevisar} por revisar · {aprobados} aprobados · {m.nuevas} fotos nuevas sin preparar</span>
              <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-white/60">
                  Publicar un post cada
                  <select value={m.cada_dias} onChange={(e) => void ajustes(m, { cada_dias: Number(e.target.value) })} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/80">
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n === 1 ? "día" : `${n} días`}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-white/60" title="ID de OnlyFans de un fan (por ejemplo, tu propia cuenta de fan). Venuz le «envía» cada foto como mensaje GRATIS (sin precio) para guardarla en el baúl; la foto no se publica ahí.">
                  Fan para el baúl
                  <input
                    defaultValue={m.fan_baul}
                    key={m.fan_baul}
                    inputMode="numeric"
                    placeholder="ID de OnlyFans"
                    onBlur={(e) => e.target.value.trim() !== m.fan_baul && void ajustes(m, { fan_baul: e.target.value.trim() })}
                    className="w-28 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-white/80"
                  />
                </label>
                <label className={`flex items-center gap-1.5 ${m.fan_baul ? "cursor-pointer text-white/60" : "text-white/25"}`} title={m.fan_baul ? "Los posts aprobados de esta modelo se envían solos a la cola de Venuz" : "Pon primero el fan para el baúl"}>
                  <input type="checkbox" disabled={!m.fan_baul} checked={m.venuz_activo} onChange={(e) => void ajustes(m, { venuz_activo: e.target.checked })} className="h-4 w-4 accent-[#8B5CF6]" />
                  Enviar a Venuz
                </label>
                {porAprobar(m) ? (
                  <button onClick={() => void aprobarTodos(m)} disabled={trabajando === m.id} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                    ✓ Aprobar los {porAprobar(m)}
                  </button>
                ) : null}
                <button onClick={() => void preparar(m)} disabled={trabajando === m.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
                  {trabajando === m.id ? "Preparando…" : m.nuevas ? `Preparar ${m.nuevas} foto${m.nuevas === 1 ? "" : "s"} nueva${m.nuevas === 1 ? "" : "s"}` : "Buscar fotos nuevas"}
                </button>
              </div>
            </div>

            {m.posts.length ? (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {m.posts.map((p) => {
                  const editable = p.estado === "borrador" || p.estado === "aprobado" || p.estado === "error";
                  return (
                    <li key={p.id} className="flex gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3">
                      <button type="button" onClick={() => setVisor({ modelo: m.id, i: Math.max(0, visibles.findIndex((x) => x.id === p.id)) })} className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-white/10" aria-label="Ver la foto grande">
                        {p.vista ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.vista} alt="Foto del post" loading="lazy" className="h-full w-full cursor-zoom-in object-cover" />
                        ) : null}
                      </button>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO[p.estado].clase}`}>{ESTADO[p.estado].texto}</span>
                          <input
                            type="datetime-local"
                            defaultValue={aMadrid(p.programar_para)}
                            key={p.programar_para}
                            disabled={!editable}
                            onBlur={(e) => e.target.value && e.target.value !== aMadrid(p.programar_para) && void guardar(p.id, { programar_para: deMadrid(e.target.value) })}
                            className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80 disabled:opacity-50"
                            aria-label="Día y hora de publicación (hora de Madrid)"
                          />
                          <span className="text-[11px] text-white/35">{bonita(p.programar_para)}</span>
                        </div>
                        <textarea
                          defaultValue={p.caption ?? ""}
                          key={p.caption ?? "vacio"}
                          rows={3}
                          disabled={!editable}
                          placeholder="Caption…"
                          onBlur={(e) => e.target.value.trim() !== (p.caption ?? "") && void guardar(p.id, { caption: e.target.value })}
                          className="input-base w-full resize-y text-sm disabled:opacity-60"
                        />
                        {p.error ? <p className="text-[11px] text-red-300">{p.error}</p> : null}
                        {editable ? (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {p.estado !== "aprobado" ? (
                              <button onClick={() => void guardar(p.id, { estado: "aprobado" })} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500">✓ Aprobar</button>
                            ) : (
                              <button onClick={() => void guardar(p.id, { estado: "borrador" })} className="btn-secondary px-3 py-1.5">Volver a revisar</button>
                            )}
                            <select
                              value={temas[p.id] ?? ""}
                              onChange={(e) => {
                                setTemas((t) => ({ ...t, [p.id]: e.target.value }));
                                void regenerar(p.id, e.target.value);
                              }}
                              disabled={trabajando === p.id}
                              aria-label="Tipo de foto: el caption sale de este tema"
                              title="Tipo de foto: al elegirlo, el caption sale de ese tema"
                              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white/80 disabled:opacity-50"
                            >
                              <option value="">Tipo: cualquiera</option>
                              {TEMAS_CAPTION.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.etiqueta}
                                </option>
                              ))}
                            </select>
                            <button onClick={() => void regenerar(p.id)} disabled={trabajando === p.id} className="btn-secondary px-3 py-1.5 disabled:opacity-50">{trabajando === p.id ? "Buscando…" : "🔄 Otro caption"}</button>
                            <button onClick={() => void guardar(p.id, { estado: "descartado" })} className="px-2 py-1.5 font-semibold text-red-300/70 hover:text-red-300">Descartar</button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-white/40">Todavía no hay posts preparados. Pulsa «{m.nuevas ? "Preparar" : "Buscar fotos nuevas"}» cuando haya fotos en su carpeta «Posts».</p>
            )}

            {visor?.modelo === m.id && visibles.length ? (
              <VisorFotos fotos={visibles.map((p) => ({ src: p.vista as string, pie: p.caption ?? undefined }))} indice={Math.min(visor.i, visibles.length - 1)} onCambiar={(i) => setVisor({ modelo: m.id, i })} onCerrar={() => setVisor(null)} />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
