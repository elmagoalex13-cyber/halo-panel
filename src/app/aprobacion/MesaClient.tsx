"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { estadoLabel, formatDate, tipoVideoLabel } from "@/lib/utils";
import { urlR2, videoBruto, videoEditado } from "@/lib/media";

export interface VideoRow {
  id: string;
  titulo: string | null;
  tipo_video: string | null;
  estado: string;
  recibido_at: string;
  r2_key: string | null;
  r2_key_referencia: string | null;
  r2_key_original: string | null;
  video_procesado_url: string | null;
  estado_procesamiento: string | null;
  error_mensaje: string | null;
  caption: string;
  frase_quemada: string;
  correcciones: string;
  modelo_nombre: string;
  cuenta_username: string | null;
  programado_at?: string | null;
}

const ESTADO_BADGE: Record<string, string> = {
  en_aprobacion: "badge-en_aprobacion",
  aprobado: "badge-aprobado",
  publicado: "badge-publicado",
  rechazado: "badge-rechazado",
  editando: "badge-editando",
};

const videoUrl = urlR2;
const TIPO_FILTROS = [
  { value: "todos", label: "Todos los tipos" },
  { value: "tipo1", label: "Hablando" },
  { value: "tipo2", label: "Frases + musica" },
  { value: "tipo3", label: "Parar imagen" },
  { value: "tipo4", label: "Referencias" },
] as const;

type Programacion =
  | { ok: true; programado_at: string; trial: boolean; cuenta: string }
  | { ok: false; motivo: string; mensaje: string };

function mensajeAprobado(p?: Programacion) {
  if (!p) return "Video aprobado.";
  if (p.ok) {
    const cuando = new Date(p.programado_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return `Aprobado y programado en Publer: @${p.cuenta}, ${cuando}${p.trial ? " (trial reel)" : " (reel)"}.`;
  }
  return p.motivo === "publer_inactivo"
    ? "Aprobado. Publer no esta activo: descargalo desde la pestana Aprobados y subelo tu; se programara solo cuando actives Publer."
    : `Aprobado, pero no se pudo programar: ${p.mensaje}`;
}

export function MesaClient({
  rows: initialRows,
  currentEstado,
}: {
  rows: VideoRow[];
  currentEstado: string;
}) {
  const router = useRouter();
  const changeFileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<VideoRow | null>(null);
  const [caption, setCaption] = useState("");
  const [correcciones, setCorrecciones] = useState("");
  const [frase, setFrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [modeloFiltro, setModeloFiltro] = useState("todos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeVideoError, setChangeVideoError] = useState<string | null>(null);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [quickLoadingId, setQuickLoadingId] = useState<string | null>(null);
  const [quickRehacer, setQuickRehacer] = useState<{ row: VideoRow; nota: string } | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setSelected(null);
    setRefOpen(false);
    setOriginalOpen(false);
    setActionMessage(null);
  }, [initialRows, currentEstado]);

  const modeloNombres = useMemo(() => Array.from(new Set(rows.map((row) => row.modelo_nombre))).sort(), [rows]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const modeloOk = modeloFiltro === "todos" || row.modelo_nombre === modeloFiltro;
        const tipoOk = tipoFiltro === "todos" || row.tipo_video === tipoFiltro;
        return modeloOk && tipoOk;
      }),
    [rows, modeloFiltro, tipoFiltro],
  );

  const closePopup = useCallback(() => {
    setSelected(null);
    setRefOpen(false);
    setOriginalOpen(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selected) return;
      if (event.key === "Escape") closePopup();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, closePopup]);

  const openPopup = useCallback((row: VideoRow) => {
    setSelected(row);
    setCaption(row.caption);
    setCorrecciones(row.correcciones);
    setFrase(row.frase_quemada);
    // Tipo 4: auto-expandir referencia y original para comparativa de 3 paneles
    const esTipo4 = row.tipo_video === "tipo4";
    setRefOpen(esTipo4 && Boolean(row.r2_key_referencia));
    setOriginalOpen(esTipo4 && Boolean(videoBruto(row)));
    setActionMessage(null);
  }, []);

  const saveAndAct = useCallback(
    async (accion: "aprobar" | "rehacer" | "descartar") => {
      if (!selected) return;
      setLoading(true);
      try {
        const res = await fetch("/api/aprobacion/accion", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, accion, caption, correcciones, frase_quemada: frase }),
        });

        if (res.ok) {
          const payload = (await res.json()) as { estado?: string; programacion?: Programacion };
          const nuevoEstado = payload.estado ?? (accion === "aprobar" ? "aprobado" : accion === "rehacer" ? "editando" : "rechazado");
          setRows((prev) =>
            nuevoEstado === currentEstado
              ? prev.map((row) =>
                  row.id === selected.id ? { ...row, estado: nuevoEstado, caption, correcciones, frase_quemada: frase } : row,
                )
              : prev.filter((row) => row.id !== selected.id),
          );
          setActionMessage(
            accion === "aprobar"
              ? mensajeAprobado(payload.programacion)
              : accion === "rehacer"
                ? "Video enviado a Rehacer IA."
                : "Video descartado.",
          );
          router.refresh();
          closePopup();
        } else {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setActionMessage(payload?.error ?? "No se pudo guardar la accion.");
        }
      } finally {
        setLoading(false);
      }
    },
    [selected, caption, correcciones, frase, currentEstado, router, closePopup],
  );

  const quickAct = useCallback(
    async (row: VideoRow, accion: "aprobar" | "descartar" | "rehacer", notaRehacer?: string) => {
      setQuickLoadingId(`${row.id}:${accion}`);
      setActionMessage(null);
      try {
        const res = await fetch("/api/aprobacion/accion", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            accion,
            caption: row.caption,
            correcciones: accion === "rehacer" ? (notaRehacer ?? row.correcciones ?? "") : row.correcciones,
            frase_quemada: row.frase_quemada,
          }),
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setActionMessage(payload?.error ?? "No se pudo guardar la accion.");
          return;
        }

        const payload = (await res.json()) as { estado?: string; programacion?: Programacion };
        const nuevoEstado = payload.estado ?? (accion === "aprobar" ? "aprobado" : accion === "rehacer" ? "editando" : "rechazado");
        setRows((prev) =>
          nuevoEstado === currentEstado
            ? prev.map((item) => (item.id === row.id ? { ...item, estado: nuevoEstado } : item))
            : prev.filter((item) => item.id !== row.id),
        );
        setActionMessage(
          accion === "aprobar" ? mensajeAprobado(payload.programacion) : accion === "rehacer" ? "Video enviado a Rehacer IA." : "Video descartado.",
        );
        router.refresh();
      } finally {
        setQuickLoadingId(null);
      }
    },
    [currentEstado, router],
  );


  async function generarCaption() {
    if (!selected) return;
    setCaptionLoading(true);
    setCaptionError(null);
    try {
      // Get hashtag combo from localStorage config (rotate using video index)
      let hashtags3: string[] = [];
      try {
        const cfg = JSON.parse(localStorage.getItem("halo-config") ?? "{}") as { hashtags?: string[] };
        const pool = (cfg.hashtags ?? []).filter(Boolean);
        if (pool.length >= 3) {
          // All combos C(5,3), pick based on selected.id hash
          const combos: string[][] = [];
          for (let i = 0; i < pool.length - 2; i++)
            for (let j = i + 1; j < pool.length - 1; j++)
              for (let k = j + 1; k < pool.length; k++)
                combos.push([pool[i], pool[j], pool[k]]);
          const idx = selected.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % combos.length;
          hashtags3 = combos[idx];
        }
      } catch {}
      const res = await fetch("/api/ia/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_video: selected.tipo_video ?? "reels",
          frase_quemada: frase || selected.frase_quemada || undefined,
          modelo_nombre: selected.modelo_nombre || undefined,
          titulo: selected.titulo || undefined,
          hashtags: hashtags3,
        }),
      });
      const data = await res.json() as { caption?: string; error?: string };
      if (data.caption) setCaption(data.caption);
      else setCaptionError(data.error ?? "Error generando caption");
    } catch (e) {
      setCaptionError(String(e));
    } finally {
      setCaptionLoading(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div>
          <p className="font-display text-lg font-semibold text-white">Cola de revision</p>
          <p className="text-xs text-white/40">
            {filteredRows.length} video{filteredRows.length === 1 ? "" : "s"} visibles
          </p>
          {actionMessage ? <p className="mt-1 text-xs text-[#22D3EE]">{actionMessage}</p> : null}
        </div>
        <div className="flex gap-2">
          <select
            value={modeloFiltro}
            onChange={(event) => setModeloFiltro(event.target.value)}
            className="input-base min-w-36 py-1.5 text-xs"
          >
            <option value="todos">Todas las modelos</option>
            {modeloNombres.map((modelo) => (
              <option key={modelo} value={modelo}>
                {modelo}
              </option>
            ))}
          </select>
          <select
            value={tipoFiltro}
            onChange={(event) => setTipoFiltro(event.target.value)}
            className="input-base min-w-40 py-1.5 text-xs"
          >
            {TIPO_FILTROS.map((tipo) => (
              <option key={tipo.value} value={tipo.value}>
                {tipo.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="grid min-h-[55vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-white/35">
          Sin videos en esta cola
        </div>
      ) : (
        <div className="max-h-[calc(100vh-230px)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-white/[0.025]">
          {filteredRows.map((row) => {
            const url = videoEditado(row);
            const canQuickReview = row.estado === "en_aprobacion";
            const approveLoading = quickLoadingId === `${row.id}:aprobar`;
            const discardLoading = quickLoadingId === `${row.id}:descartar`;
            const remakeLoading = quickLoadingId === `${row.id}:rehacer`;
            return (
              <div
                key={row.id}
                className="group grid w-full grid-cols-[58px_1fr] gap-3 border-b border-white/[0.06] p-3 text-left transition-all duration-150 last:border-b-0 hover:border-[#8B5CF6]/35 hover:bg-white/[0.055] sm:grid-cols-[68px_1fr_auto] sm:gap-4 sm:p-4"
              >
                <button
                  type="button"
                  onClick={() => openPopup(row)}
                  className="relative h-24 w-[54px] overflow-hidden rounded-xl bg-black text-left ring-1 ring-white/[0.08] sm:h-28 sm:w-[63px]"
                  aria-label={`Revisar ${row.titulo ?? row.id}`}
                >
                  {url ? (
                    <video
                      src={url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-white/25">Sin video</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-90 transition-opacity group-hover:bg-black/10">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-black/65 ring-1 ring-white/20 transition-transform group-hover:scale-105">
                      <svg className="ml-0.5 h-4 w-4 text-white" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M6 4l6 4-6 4V4z" />
                      </svg>
                    </div>
                  </div>
                </button>

                <button type="button" onClick={() => openPopup(row)} className="min-w-0 self-center text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white/90 sm:text-base">{row.titulo ?? `#${row.id.slice(-6)}`}</p>
                    <span className={`badge px-2 py-0.5 text-[9px] sm:hidden ${ESTADO_BADGE[row.estado] ?? "badge"}`}>
                      {estadoLabel(row.estado)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/45">
                    {row.modelo_nombre}
                    {row.cuenta_username ? ` · @${row.cuenta_username}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                      {tipoVideoLabel(row.tipo_video ?? "sin_clasificar")}
                    </span>
                    <span className="font-mono text-[10px] text-white/25">{formatDate(row.recibido_at)}</span>
                  </div>
                  {(row.caption || row.frase_quemada) ? (
                    <p className="mt-2 line-clamp-1 text-xs text-white/35">{row.caption || row.frase_quemada}</p>
                  ) : null}
                </button>

                <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 self-center sm:col-span-1 sm:min-w-44">
                  <span className={`badge px-2.5 py-1 text-[9px] ${ESTADO_BADGE[row.estado] ?? "badge"}`}>
                    {row.estado === "aprobado" ? (row.programado_at ? "Programado" : "Sin programar") : estadoLabel(row.estado)}
                  </span>
                  {row.estado === "aprobado" && row.programado_at ? (
                    <p className="mt-1 text-[10px] text-white/40">
                      {new Date(row.programado_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  ) : null}
                  {canQuickReview ? (
                    <>
                      <button
                        type="button"
                        onClick={() => quickAct(row, "aprobar")}
                        disabled={Boolean(quickLoadingId)}
                        className="rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400/70 hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        {approveLoading ? "..." : "✓ Aprobar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => quickAct(row, "descartar")}
                        disabled={Boolean(quickLoadingId)}
                        className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:border-red-400/70 hover:bg-red-500/20 disabled:opacity-40"
                      >
                        {discardLoading ? "..." : "Descartar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickRehacer({ row, nota: row.correcciones ?? "" })}
                        disabled={Boolean(quickLoadingId)}
                        className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:border-amber-300/70 hover:bg-amber-400/20 disabled:opacity-40"
                      >
                        {remakeLoading ? "..." : "Rehacer"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openPopup(row)}
                    className="text-xs font-semibold text-[#8B5CF6] opacity-75 transition-opacity group-hover:opacity-100"
                  >
                    Revisar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true">
          <div className="relative grid h-[94vh] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl border border-white/[0.1] bg-[#08080d] shadow-[0_24px_80px_rgba(0,0,0,0.65)] lg:grid-cols-[minmax(260px,420px)_1fr]">
            <button
              onClick={closePopup}
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/40 text-sm text-white/55 transition hover:border-white/20 hover:text-white"
              aria-label="Cerrar popup"
            >
              x
            </button>

            <div className="grid min-h-0 place-items-center bg-black p-3 sm:p-5">
              <div className="h-full max-h-[88vh] w-auto overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
                {videoEditado(selected) ? (
                  <video
                    key={selected.id}
                    src={videoEditado(selected)!}
                    controls
                    playsInline
                    autoPlay
                    className="h-full max-h-[88vh] aspect-[9/16] object-contain"
                  />
                ) : (
                  <div className="grid aspect-[9/16] h-full min-h-[360px] place-items-center text-xs text-white/25">
                    Sin video
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl lg:border-l lg:border-t-0">
              <div className="pr-10">
                <p className="font-mono text-[10px] text-white/40">
                  {selected.modelo_nombre}
                  {selected.cuenta_username ? ` · @${selected.cuenta_username}` : ""}
                </p>
                <p className="mt-0.5 truncate font-mono text-[9px] text-white/25">
                  {selected.r2_key?.split("/").pop() ?? selected.id}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`badge text-[9px] ${ESTADO_BADGE[selected.estado] ?? "badge"}`}>
                    {estadoLabel(selected.estado)}
                  </span>
                  <span className="badge text-[9px]">{tipoVideoLabel(selected.tipo_video ?? "sin_clasificar")}</span>
                  {selected.tipo_video === "tipo4" && (
                    <span className="rounded-full bg-violet-900/40 px-2 py-0.5 text-[9px] font-semibold text-violet-300 border border-violet-700/30">
                      ◈ 3 paneles activos
                    </span>
                  )}
                </div>
                {selected.estado_procesamiento && selected.estado === "editando" ? (
                  <p
                    className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                      selected.estado_procesamiento === "error"
                        ? "border-red-900/50 bg-red-950/30 text-red-300"
                        : "border-amber-700/30 bg-amber-950/20 text-amber-300"
                    }`}
                  >
                    {selected.estado_procesamiento === "pendiente" && "En cola del runner: se procesara en unos segundos."}
                    {selected.estado_procesamiento === "procesando" && "El runner esta procesando este video..."}
                    {selected.estado_procesamiento === "error" &&
                      `Error del runner: ${selected.error_mensaje ?? "desconocido"}. Pulsa Rehacer para reintentar.`}
                    {selected.estado_procesamiento === "listo" && "Procesado. Aparecera en En aprobacion."}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[9px] font-semibold uppercase tracking-widest text-white/35">Caption</label>
                  <button type="button" onClick={generarCaption} disabled={captionLoading || !selected}
                    className="flex items-center gap-1 rounded-md border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 px-2 py-0.5 text-[9px] font-semibold text-[#A78BFA] transition-all hover:border-[#8B5CF6]/70 hover:bg-[#8B5CF6]/20 disabled:opacity-40">
                    {captionLoading ? "Generando..." : "✨ Generar con IA"}
                  </button>
                </div>
                {captionError && <p className="mb-1 text-[9px] text-red-400">{captionError}</p>}
                <textarea
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  rows={4}
                  maxLength={2200}
                  placeholder="sin caption - escribe aqui el texto de la publicacion"
                  className="input-base w-full resize-none text-xs"
                />
                <p className="mt-0.5 text-right text-[9px] text-white/20">{caption.length}/2200</p>
              </div>

              <div>
                <label className="mb-1 block text-[9px] font-semibold uppercase tracking-widest text-white/35">
                  Nota para Rehacer <span className="font-normal normal-case text-white/20">(obligatoria para rehacer)</span>
                </label>
                <textarea
                  value={correcciones}
                  onChange={(event) => setCorrecciones(event.target.value)}
                  rows={2}
                  placeholder="que hay que cambiar y como (se guarda con el video)"
                  className="input-base w-full resize-none text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-[9px] font-semibold uppercase tracking-widest text-white/35">
                  Subtitulos / frase quemada <span className="font-normal normal-case text-white/20">- cambiala y se remonta</span>
                </label>
                <textarea
                  value={frase}
                  onChange={(event) => setFrase(event.target.value)}
                  rows={4}
                  className="input-base w-full resize-none font-mono text-xs"
                />
              </div>

              <div className="relative">
                <input
                  ref={changeFileRef}
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !selected) return;
                    setChangeLoading(true);
                    setChangeVideoError(null);
                    try {
                      const fd = new FormData();
                      fd.append("file", f);
                      fd.append("content_id", selected.id);
                      await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.addEventListener("load", () => {
                          if (xhr.status >= 200 && xhr.status < 300) resolve();
                          else {
                            try { reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error ?? `Error ${xhr.status}`)); }
                            catch { reject(new Error(`Error ${xhr.status}`)); }
                          }
                        });
                        xhr.addEventListener("error", () => reject(new Error("Error de red")));
                        xhr.open("POST", "/api/upload");
                        xhr.send(fd);
                      });
                      if (changeFileRef.current) changeFileRef.current.value = "";
                      router.refresh();
                      closePopup();
                    } catch (err) {
                      setChangeVideoError(err instanceof Error ? err.message : "Error al cambiar el video");
                    } finally {
                      setChangeLoading(false);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={changeLoading}
                  onClick={() => changeFileRef.current?.click()}
                  className="btn-secondary flex w-fit items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  {changeLoading ? "Subiendo..." : "↺ Cambiar video"}
                </button>
                {changeVideoError && (
                  <p className="mt-1 text-[10px] text-red-400">{changeVideoError}</p>
                )}
              </div>

              <div className="flex-1" />

              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-white/35">Comparativa</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[10px] text-white/35">Referencia</p>
                    {selected.r2_key_referencia ? (
                      refOpen ? (
                        <div className="relative mx-auto max-h-[280px] overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "9/16" }}>
                          <video
                            key={`ref-${selected.id}`}
                            src={videoUrl(selected.r2_key_referencia)!}
                            controls
                            playsInline
                            autoPlay
                            className="h-full w-full object-contain"
                          />
                          <button
                            onClick={() => setRefOpen(false)}
                            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/75 text-[10px] text-white hover:bg-black"
                            aria-label="Cerrar referencia"
                          >
                            x
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRefOpen(true)}
                          className="group relative flex h-28 w-16 overflow-hidden rounded-xl bg-black ring-1 ring-white/10 transition-all hover:ring-[#8B5CF6]/60"
                        >
                          <video src={videoUrl(selected.r2_key_referencia)!} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/20">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-black/70 ring-1 ring-white/20">
                              <svg className="ml-0.5 h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M6 4l6 4-6 4V4z" />
                              </svg>
                            </div>
                          </div>
                          <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] text-white/60">ver ref.</span>
                        </button>
                      )
                    ) : (
                      <div className="grid h-28 w-16 place-items-center rounded-xl border border-dashed border-white/[0.08] text-center text-[10px] text-white/25">
                        Sin ref.
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-[10px] text-white/35">Original sin editar</p>
                    {videoBruto(selected) ? (
                      originalOpen ? (
                        <div className="relative mx-auto max-h-[280px] overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "9/16" }}>
                          <video
                            key={`original-${selected.id}`}
                            src={videoBruto(selected)!}
                            controls
                            playsInline
                            autoPlay
                            className="h-full w-full object-contain"
                          />
                          <button
                            onClick={() => setOriginalOpen(false)}
                            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/75 text-[10px] text-white hover:bg-black"
                            aria-label="Cerrar original"
                          >
                            x
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOriginalOpen(true)}
                          className="group relative flex h-28 w-16 overflow-hidden rounded-xl bg-black ring-1 ring-white/10 transition-all hover:ring-[#06B6D4]/60"
                        >
                          <video src={videoBruto(selected)!} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/20">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-black/70 ring-1 ring-white/20">
                              <svg className="ml-0.5 h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M6 4l6 4-6 4V4z" />
                              </svg>
                            </div>
                          </div>
                          <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] text-white/60">ver original</span>
                        </button>
                      )
                    ) : (
                      <div className="grid h-28 w-16 place-items-center rounded-xl border border-dashed border-white/[0.08] px-1 text-center text-[10px] leading-tight text-white/25">
                        Sin original
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
                {videoEditado(selected) && (
                  <a
                    href={`/api/descargar?id=${selected.id}&tipo=editado`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 py-2 text-sm font-medium text-[#A78BFA] transition-all hover:border-[#8B5CF6]/60 hover:bg-[#8B5CF6]/20"
                  >
                    ↓ Descargar mp4
                  </a>
                )}
                <button
                  onClick={() => saveAndAct("aprobar")}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] disabled:opacity-40"
                >
                  ✓ Aprobar <kbd className="rounded bg-emerald-900/60 px-1.5 text-[9px] font-normal">A</kbd>
                </button>
                <button
                  onClick={() => saveAndAct("rehacer")}
                  disabled={loading || !correcciones.trim()}
                  title={correcciones.trim() ? undefined : "Escribe una nota para rehacer"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/80 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                >
                  ↺ Rehacer <kbd className="rounded bg-white/10 px-1.5 text-[9px] font-normal">R</kbd>
                </button>
                <a
                  href={`/api/descargar?id=${selected.id}&tipo=original`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 py-2.5 text-sm font-semibold text-amber-400 transition-all hover:bg-amber-950/50 hover:text-amber-300"
                >
                  ↓ Editar yo <span className="text-[9px] font-normal opacity-60">(descarga original)</span>
                </a>
                <button
                  onClick={() => saveAndAct("descartar")}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-900/40 bg-red-950/40 py-2.5 text-sm font-semibold text-red-400 transition-all hover:bg-red-950/60 hover:text-red-300 disabled:opacity-40"
                >
                  x Descartar <kbd className="rounded bg-red-900/40 px-1.5 text-[9px] font-normal">X</kbd>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quickRehacer ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#101018] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg font-semibold text-white">Rehacer video</p>
                <p className="mt-1 text-xs text-white/40">{quickRehacer.row.titulo ?? quickRehacer.row.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickRehacer(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white"
                aria-label="Cerrar"
              >
                x
              </button>
            </div>
            <label className="mt-4 block text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Nota opcional para el runner
            </label>
            <textarea
              value={quickRehacer.nota}
              onChange={(event) => setQuickRehacer((current) => current ? { ...current, nota: event.target.value } : current)}
              rows={4}
              className="input-base mt-2 w-full resize-none text-sm"
              placeholder="Ej: subir el texto, cambiar frase, recortar mejor, usar otra versión..."
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={Boolean(quickLoadingId)}
                onClick={async () => {
                  const row = quickRehacer.row;
                  setQuickRehacer(null);
                  await quickAct(row, "rehacer", "");
                }}
                className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07] disabled:opacity-40"
              >
                Rehacer sin nota
              </button>
              <button
                type="button"
                disabled={Boolean(quickLoadingId)}
                onClick={async () => {
                  const { row, nota } = quickRehacer;
                  setQuickRehacer(null);
                  await quickAct(row, "rehacer", nota);
                }}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40"
              >
                Enviar con nota
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
