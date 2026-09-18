"use client";

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { formatDate } from "@/lib/utils";
import { TIPOS_EDICION, nombreTipo } from "@/lib/tiposEdicion";
import { compacto, metricasDe, pct } from "@/lib/viral";
import type { ReferenciaVideo } from "@/types";

function urlVideo(url: string | null | undefined) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return base ? `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}` : null;
}

function tipoDe(v: ReferenciaVideo) {
  const n = Number(String(v.formato_confirmado ?? "").replace(/\D/g, ""));
  return n >= 1 && n <= 4 ? n : null;
}

type Vista = "pendiente" | "aprobado" | "descartado";

export function IdeasViralesTab({ videos: iniciales, modelos }: { videos: ReferenciaVideo[]; modelos: { id: string; nombre: string }[] }) {
  const [videos, setVideos] = useState(iniciales);
  const [vista, setVista] = useState<Vista>("pendiente");
  const [dias, setDias] = useState(0);
  const [cuenta, setCuenta] = useState("todas");
  const [orden, setOrden] = useState<"vistas" | "likes" | "comentarios" | "reciente">("vistas");
  const [enviando, setEnviando] = useState<ReferenciaVideo | null>(null);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const cuentas = useMemo(() => Array.from(new Set(videos.map((v) => v.cuenta_username).filter(Boolean))).sort() as string[], [videos]);

  const estadoDe = (v: ReferenciaVideo): Vista => (v.estado_triaje === "confirmado" ? "aprobado" : v.estado_triaje === "descartado" ? "descartado" : "pendiente");

  const visibles = useMemo(() => {
    const limite = dias ? Date.now() - dias * 86400000 : 0;
    return videos
      .filter((v) => estadoDe(v) === vista)
      .filter((v) => cuenta === "todas" || v.cuenta_username === cuenta)
      .filter((v) => !limite || (v.fecha_publicacion && new Date(v.fecha_publicacion).getTime() >= limite))
      .sort((a, b) => {
        const ma = metricasDe(a);
        const mb = metricasDe(b);
        if (orden === "likes") return mb.likes - ma.likes;
        if (orden === "comentarios") return mb.comentarios - ma.comentarios;
        if (orden === "reciente") return new Date(b.fecha_publicacion ?? 0).getTime() - new Date(a.fecha_publicacion ?? 0).getTime();
        return mb.vistas - ma.vistas;
      });
  }, [videos, vista, dias, cuenta, orden]);

  const conteo = (x: Vista) => videos.filter((v) => estadoDe(v) === x).length;

  function parchear(id: string, cambios: Partial<ReferenciaVideo>) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...cambios } : v)));
  }

  async function guardar(v: ReferenciaVideo, cambios: { formato_confirmado?: string | null; estado_triaje?: string }) {
    parchear(v.id, cambios as Partial<ReferenciaVideo>);
    await fetch(`/api/referencias/videos/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
  }

  function abrirEnvio(v: ReferenciaVideo) {
    setEnviando(v);
    setElegidas([]);
    setNota("");
    setMsg(null);
  }

  async function aprobar() {
    if (!enviando) return;
    const tipo = tipoDe(enviando);
    if (!tipo) return;
    setCargando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/referencias/videos/${enviando.id}/asignar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo_ids: elegidas, tipo, instrucciones: nota }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; confirmado_at?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo enviar");
      parchear(enviando.id, { estado_triaje: "confirmado", confirmado_at: j.confirmado_at ?? new Date().toISOString() });
      setEnviando(null);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["pendiente", "aprobado", "descartado"] as const).map((x) => (
          <button
            key={x}
            onClick={() => setVista(x)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${vista === x ? "bg-[#8B5CF6] text-white" : "bg-white/[0.05] text-white/50 hover:text-white/80"}`}
          >
            {x === "pendiente" ? "Por revisar" : x === "aprobado" ? "Aprobados" : "Descartados"} ({conteo(x)})
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="input-base py-1.5 text-xs">
            <option value={0}>Todo el tiempo</option>
            <option value={3}>Últimos 3 días</option>
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="input-base py-1.5 text-xs">
            <option value="todas">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c} value={c}>
                @{c}
              </option>
            ))}
          </select>
          <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} className="input-base py-1.5 text-xs">
            <option value="vistas">Más vistas</option>
            <option value="likes">Más likes</option>
            <option value="comentarios">Más comentarios</option>
            <option value="reciente">Más recientes</option>
          </select>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {vista === "pendiente"
            ? "No hay vídeos por revisar. El scraper añade aquí los más virales de las cuentas de referencia."
            : "Nada por aquí todavía."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((v) => {
            const m = metricasDe(v);
            const src = urlVideo(v.video_url);
            const tipo = tipoDe(v);
            return (
              <article key={v.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                  {src ? (
                    <video src={src} poster={v.thumbnail_url ?? undefined} controls playsInline preload="none" className="aspect-[9/16] w-full object-contain" />
                  ) : (
                    <div className="grid aspect-[9/16] place-items-center text-xs text-white/25">Sin vídeo</div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white/80">@{v.cuenta_username ?? "?"}</span>
                  <span className="text-white/35">{v.fecha_publicacion ? formatDate(v.fecha_publicacion) : "—"}</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-center">
                  <Metrica label="Visitas" valor={compacto(m.vistas)} />
                  <Metrica label="Likes" valor={compacto(m.likes)} sub={pct(m.tasaLikes)} />
                  <Metrica label="Comentarios" valor={compacto(m.comentarios)} sub={pct(m.tasaComentarios)} />
                  <Metrica label="Compartidos" valor={m.compartidos ? compacto(m.compartidos) : "n/d"} sub={m.compartidos ? pct(m.tasaCompartidos) : undefined} />
                </div>

                {v.descripcion ? <p className="line-clamp-2 text-xs text-white/45">{v.descripcion}</p> : null}

                {vista === "pendiente" ? (
                  <>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-white/30">Tipo de edición</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {TIPOS_EDICION.map((t) => (
                          <button
                            key={t.tipo}
                            onClick={() => guardar(v, { formato_confirmado: `tipo${t.tipo}` })}
                            title={t.desc}
                            className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                              tipo === t.tipo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:border-white/20"
                            }`}
                          >
                            {t.tipo} {t.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-auto flex gap-2">
                      <button
                        onClick={() => abrirEnvio(v)}
                        disabled={!tipo}
                        title={tipo ? undefined : "Etiqueta el tipo primero"}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        onClick={() => guardar(v, { estado_triaje: "descartado" })}
                        className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-950/50"
                      >
                        Descartar
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto flex items-center justify-between">
                    <span className="badge">{tipo ? `Tipo ${tipo} · ${nombreTipo(tipo)}` : "Sin tipo"}</span>
                    <button onClick={() => guardar(v, { estado_triaje: "pendiente" })} className="text-xs text-white/40 hover:text-white">
                      Devolver a revisar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {enviando ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-md space-y-4 p-5">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">Enviar a las modelos</h3>
              <p className="text-xs text-white/40">
                Tipo {tipoDe(enviando)} · {nombreTipo(tipoDe(enviando) ?? 4)}. Les aparecerá en su portal como vídeo pendiente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {modelos.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setElegidas((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    elegidas.includes(m.id) ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-white/[0.1] bg-white/[0.04] text-white/60 hover:text-white"
                  }`}
                >
                  {elegidas.includes(m.id) ? "✓ " : ""}
                  {m.nombre}
                </button>
              ))}
              {modelos.length === 0 ? <p className="text-sm text-white/40">No hay modelos activas.</p> : null}
            </div>
            <button
              onClick={() => setElegidas(elegidas.length === modelos.length ? [] : modelos.map((m) => m.id))}
              className="text-xs text-[#A78BFA] hover:underline"
            >
              {elegidas.length === modelos.length ? "Quitar todas" : "Elegir todas"}
            </button>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Instrucciones (opcional)" className="input-base w-full" />
            {msg ? <p className="text-xs text-red-300">{msg.texto}</p> : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEnviando(null)} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              <button onClick={aprobar} disabled={cargando || !elegidas.length} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                {cargando ? "Enviando..." : `Aprobar y enviar a ${elegidas.length || ""}`}
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}

function Metrica({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
      <p className="text-sm font-semibold text-white">{valor}</p>
      {sub ? <p className="text-[10px] text-white/40">{sub}</p> : null}
    </div>
  );
}
