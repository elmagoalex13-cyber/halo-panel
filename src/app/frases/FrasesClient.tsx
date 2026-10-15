"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { SIN_CANCION } from "@/lib/frases";

interface Frase {
  id: string;
  frase: string;
  cancion_nombre: string;
  cancion_artista: string | null;
  audio_id_ig: string | null;
  origen: string;
  puntuacion: number;
  veces_usada: number;
  activa: boolean;
}

type Formulario = { id: string | null; frase: string; cancion_nombre: string; cancion_artista: string; audio_id_ig: string; puntuacion: string };
const VACIO: Formulario = { id: null, frase: "", cancion_nombre: "", cancion_artista: "", audio_id_ig: "", puntuacion: "5" };

async function llamar(method: string, body: unknown) {
  const res = await fetch("/api/frases", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { data?: Frase; error?: string };
  if (!res.ok) throw new Error(j.error ?? "Error");
  return j;
}

type VideoMusica = { id: string; cuenta: string; thumbnail_url: string | null; frase: string | null; cancion: string | null; artista: string | null; estado: string | null; visitas: number | null };

export function FrasesClient({ frases: init, conMusica: conMusicaInicial = [] }: { frases: Frase[]; conMusica?: string[] }) {
  const [frases, setFrases] = useState(init);
  // Musica de las frases: todas deben tenerla. Las que no, se completan desde la pagina (de un video guardado o subiendo un audio)
  const [conMusica, setConMusica] = useState<string[]>(conMusicaInicial);
  const [pidiendo, setPidiendo] = useState<string[]>([]); // frases a las que se les esta sacando la musica de un video
  const [musicaDe, setMusicaDe] = useState<Frase | null>(null);
  const [videosMusica, setVideosMusica] = useState<VideoMusica[] | null>(null);
  const [musicaMsg, setMusicaMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [musicaCargando, setMusicaCargando] = useState(false);
  const sinMusica = frases.filter((f) => f.activa && !conMusica.includes(f.id));
  const [filter, setFilter] = useState<"all" | "activa" | "inactiva">("all");
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<Formulario | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return frases
      .filter((f) => (filter === "activa" ? f.activa : filter === "inactiva" ? !f.activa : true))
      .filter((f) => !q || `${f.frase} ${f.cancion_nombre} ${f.cancion_artista ?? ""}`.toLowerCase().includes(q));
  }, [frases, filter, busqueda]);

  async function abrirMusica(f: Frase) {
    setMusicaDe(f);
    setMusicaMsg(null);
    setVideosMusica(null);
    const res = await fetch("/api/frases/musica", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { videos?: VideoMusica[] };
    setVideosMusica(j.videos ?? []);
  }

  async function musicaDesdeVideo(f: Frase, v: VideoMusica) {
    setMusicaCargando(true);
    setMusicaMsg(null);
    try {
      const res = await fetch("/api/frases/musica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "desde_video", frase_id: f.id, video_id: v.id }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo pedir");
      setPidiendo((p) => [...p, f.id]);
      setMusicaDe(null);
    } catch (e) {
      setMusicaMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setMusicaCargando(false);
    }
  }

  async function subirMusica(f: Frase, archivo: File) {
    setMusicaCargando(true);
    setMusicaMsg(null);
    try {
      const pedir = await fetch("/api/frases/musica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "subida", frase_id: f.id, contentType: archivo.type || "audio/mpeg" }) });
      const j = (await pedir.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!pedir.ok || !j.url) throw new Error(j.error ?? "No se pudo preparar la subida");
      const put = await fetch(j.url, { method: "PUT", headers: { "Content-Type": archivo.type || "audio/mpeg" }, body: archivo });
      if (!put.ok) throw new Error("No se pudo subir el archivo");
      const fin = await fetch("/api/frases/musica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "subida_hecha", frase_id: f.id }) });
      const k = (await fin.json().catch(() => ({}))) as { error?: string };
      if (!fin.ok) throw new Error(k.error ?? "No se pudo confirmar la subida");
      setConMusica((p) => [...p, f.id]);
      setMusicaDe(null);
    } catch (e) {
      setMusicaMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setMusicaCargando(false);
    }
  }

  async function accion(clave: string, fn: () => Promise<void>) {
    setLoading(clave);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  const eliminar = (f: Frase) => {
    if (!confirm(`Eliminar la frase "${f.frase.slice(0, 60)}"?`)) return;
    void accion(f.id, async () => {
      await llamar("DELETE", { id: f.id });
      setFrases((prev) => prev.filter((x) => x.id !== f.id));
    });
  };

  const alternar = (f: Frase) =>
    accion(f.id, async () => {
      await llamar("PATCH", { id: f.id, activa: !f.activa });
      setFrases((prev) => prev.map((x) => (x.id === f.id ? { ...x, activa: !x.activa } : x)));
    });

  function editar(f: Frase) {
    setForm({
      id: f.id,
      frase: f.frase,
      cancion_nombre: f.cancion_nombre === SIN_CANCION ? "" : f.cancion_nombre,
      cancion_artista: f.cancion_artista ?? "",
      audio_id_ig: f.audio_id_ig ?? "",
      puntuacion: String(f.puntuacion),
    });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function guardar(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    void accion("form", async () => {
      const datos = {
        frase: form.frase,
        cancion_nombre: form.cancion_nombre,
        cancion_artista: form.cancion_artista,
        audio_id_ig: form.audio_id_ig,
        puntuacion: parseInt(form.puntuacion, 10),
      };
      if (form.id) {
        const { data } = await llamar("PATCH", { id: form.id, ...datos });
        if (data) setFrases((prev) => prev.map((x) => (x.id === data.id ? data : x)));
      } else {
        const { data } = await llamar("POST", datos);
        if (data) setFrases((prev) => [data, ...prev]);
      }
      setForm(null);
    });
  }

  const campo = (k: keyof Formulario, v: string) => setForm((p) => (p ? { ...p, [k]: v } : p));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-halo-text">Banco de Frases</h1>
          {sinMusica.length ? (
            <p className="mt-2 max-w-2xl rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              {sinMusica.length} {sinMusica.length === 1 ? "frase activa no tiene" : "frases activas no tienen"} música y no se {sinMusica.length === 1 ? "usa" : "usan"} en los vídeos mientras haya otras con música. Pulsa «🎵 Poner música» en cada una (de un vídeo guardado o subiendo un audio).
            </p>
          ) : null}
          <p className="mt-1 text-sm text-halo-subtle">
            {frases.filter((f) => f.activa).length} activas · {frases.length} total · el runner y la confirmación de reparto usan la activa menos usada en los vídeos tipo 2
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar frase o canción..."
            className="input-base w-56 py-1.5 text-sm"
          />
          {(["all", "activa", "inactiva"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${filter === value ? "border-halo-accent/30 bg-halo-accent/15 text-halo-accent" : "border-halo-border text-halo-subtle hover:text-halo-text"}`}
            >
              {value === "all" ? "Todas" : value === "activa" ? "Activas" : "Inactivas"}
            </button>
          ))}
          <button onClick={() => setForm({ ...VACIO })} className="btn-primary px-3 py-1.5 text-sm">
            + Nueva
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {form ? (
        <form onSubmit={guardar} className="card space-y-3 border-halo-accent/30">
          <h3 className="font-display text-sm font-semibold text-halo-text">{form.id ? "Editar frase" : "Nueva frase"}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-halo-subtle">Frase / caption que se quema en el vídeo</label>
              <textarea
                className="input-base min-h-24 resize-y leading-relaxed"
                value={form.frase}
                onChange={(e) => campo("frase", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-halo-subtle">Canción (opcional)</label>
              <input className="input-base" value={form.cancion_nombre} onChange={(e) => campo("cancion_nombre", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-halo-subtle">Artista</label>
              <input className="input-base" value={form.cancion_artista} onChange={(e) => campo("cancion_artista", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-halo-subtle">ID del audio en Instagram</label>
              <input className="input-base" value={form.audio_id_ig} onChange={(e) => campo("audio_id_ig", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-halo-subtle">Puntuación (0-10)</label>
              <input type="number" min="0" max="10" className="input-base" value={form.puntuacion} onChange={(e) => campo("puntuacion", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="btn-secondary px-3 py-1.5 text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={loading === "form"} className="btn-primary px-3 py-1.5 text-sm">
              {loading === "form" ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-halo-border">
              {["Frase", "Canción", "Punt.", "Usos", "Estado", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-halo-subtle">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-halo-subtle">
                  {frases.length === 0 ? "Aún no hay frases. Añade la primera con «+ Nueva»." : "Ninguna frase coincide"}
                </td>
              </tr>
            ) : null}
            {filtered.map((f) => (
              <tr key={f.id} className={`border-b border-halo-border/50 hover:bg-white/[0.02] ${!f.activa ? "opacity-50" : ""}`}>
                <td className="max-w-xs px-4 py-3">
                  <p className="line-clamp-2 text-sm text-halo-text">{f.frase}</p>
                  {conMusica.includes(f.id) ? (
                    <span className="mt-1 inline-block rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" title="El video sale con la cancion del video scrapeado de donde salio esta frase">🎵 con música</span>
                  ) : pidiendo.includes(f.id) ? (
                    <span className="mt-1 inline-block rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">⏳ sacando la música… (1 minuto, recarga después)</span>
                  ) : (
                    <button type="button" onClick={() => void abrirMusica(f)} className="mt-1 inline-block rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/20" title="Esta frase no tiene música y no se usa en los vídeos">
                      🎵 Poner música
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-halo-text">{f.cancion_nombre === SIN_CANCION ? "—" : f.cancion_nombre}</div>
                  {f.cancion_artista ? <div className="text-xs text-halo-subtle">{f.cancion_artista}</div> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div key={i} className="h-2 w-2 rounded-sm" style={{ backgroundColor: i < f.puntuacion ? "#7B5EFF" : "#2A2D40" }} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-halo-subtle">{f.veces_usada}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => alternar(f)}
                    disabled={loading === f.id}
                    className={`rounded-md border px-3 py-1 text-xs transition-colors ${f.activa ? "border-green-500/30 bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400" : "border-halo-border bg-halo-muted text-halo-subtle hover:bg-green-500/15 hover:text-green-400"}`}
                  >
                    {loading === f.id ? "..." : f.activa ? "Activa" : "Inactiva"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => editar(f)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-2.5 py-1.5 text-xs font-semibold text-[#C4B5FD] transition-colors hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/15 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button onClick={() => eliminar(f)} disabled={loading === f.id} className="rounded-md border border-white/10 bg-white/5 p-1.5 text-white/30 transition-colors hover:border-red-500/30 hover:text-red-400" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {musicaDe ? (
        <div className="sin-blur fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="dialog" aria-modal="true">
          <div className="glass-card flex max-h-[88dvh] w-full max-w-2xl flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-white">🎵 Poner música a la frase</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-white/55">«{musicaDe.frase}»</p>
              </div>
              <button type="button" onClick={() => setMusicaDe(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white" aria-label="Cerrar">
                x
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm font-semibold text-white">Subir un audio</p>
              <p className="text-xs text-white/45">Un mp3, m4a o un video: se usa su sonido (los primeros 20 segundos).</p>
              <input
                type="file"
                accept="audio/*,video/*"
                disabled={musicaCargando}
                onChange={(e) => e.target.files?.[0] && void subirMusica(musicaDe, e.target.files[0])}
                className="mt-2 block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-[#8B5CF6]/30 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="mb-2 text-sm font-semibold text-white">…o usar la música de un vídeo guardado</p>
              {videosMusica === null ? <p className="text-sm text-white/40">Cargando vídeos…</p> : null}
              {videosMusica && !videosMusica.length ? <p className="text-sm text-white/40">No hay vídeos guardados de cuentas de frases.</p> : null}
              <ul className="grid gap-2 sm:grid-cols-2">
                {(videosMusica ?? []).map((v) => (
                  <li key={v.id} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail_url} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-20 w-14 shrink-0 rounded-lg bg-black/40" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white/80">@{v.cuenta}</p>
                      <p className="truncate text-[11px] text-white/45">{v.cancion ? `${v.cancion}${v.artista ? ` · ${v.artista}` : ""}` : "Canción sin nombre"}</p>
                      <button type="button" disabled={musicaCargando} onClick={() => void musicaDesdeVideo(musicaDe, v)} className="mt-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                        Usar su música
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {musicaMsg ? <p className={`text-sm ${musicaMsg.ok ? "text-emerald-300" : "text-red-300"}`}>{musicaMsg.texto}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
