"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { estadoLabel, formatDate, tipoVideoLabel } from "@/lib/utils";
import { urlR2, videoBrutoAlternativas, videoEditado } from "@/lib/media";
import { AvatarModelo } from "@/components/AvatarModelo";

export interface VideoRow {
  id: string;
  modelo_id?: string | null;
  modelo_foto?: number | null;
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
  recorte_inicio?: number | null;
  recorte_fin?: number | null;
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

function OriginalSinEditar({
  row,
  abierto,
  onAbrir,
  onCerrar,
}: {
  row: VideoRow;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
}) {
  const sources = useMemo(() => videoBrutoAlternativas(row), [row]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex] ?? null;
  const failed = sources.length > 0 && !src;

  useEffect(() => {
    setSourceIndex(0);
  }, [row.id]);

  function probarSiguiente() {
    setSourceIndex((current) => current + 1);
  }

  if (!sources.length) {
    return (
      <div className="grid h-28 w-16 place-items-center rounded-xl border border-dashed border-white/[0.08] px-1 text-center text-[10px] leading-tight text-white/25">
        Sin original
      </div>
    );
  }

  if (failed) {
    return (
      <div className="grid h-28 w-20 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 px-2 text-center text-[10px] leading-tight text-amber-100">
        No se pudo cargar el original
      </div>
    );
  }

  if (abierto) {
    return (
      <div className="relative mx-auto max-h-[280px] overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "9/16" }}>
        <video
          key={`original-${row.id}-${sourceIndex}`}
          src={src}
          controls
          playsInline
          autoPlay
          onError={probarSiguiente}
          className="h-full w-full object-contain"
        />
        <button
          onClick={onCerrar}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/75 text-[10px] text-white hover:bg-black"
          aria-label="Cerrar original"
        >
          x
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group relative flex h-28 w-16 overflow-hidden rounded-xl bg-black ring-1 ring-white/10 transition-all hover:ring-[#06B6D4]/60"
    >
      <video
        key={`original-thumb-${row.id}-${sourceIndex}`}
        src={src}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        onError={probarSiguiente}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/20">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-black/70 ring-1 ring-white/20">
          <svg className="ml-0.5 h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 4l6 4-6 4V4z" />
          </svg>
        </div>
      </div>
      <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] text-white/60">ver original</span>
    </button>
  );
}

function formatearSegundos(s: number | null) {
  if (s === null || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, "0")}`;
}

function RecorteManualEditor({ row, onGuardado }: { row: VideoRow; onGuardado: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duracion, setDuracion] = useState<number | null>(null);
  const [inicio, setInicio] = useState<number | null>(row.recorte_inicio ?? null);
  const [fin, setFin] = useState<number | null>(row.recorte_fin ?? null);
  const [arrastrando, setArrastrando] = useState<"inicio" | "fin" | null>(null);
  const [pausadoEn, setPausadoEn] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    setInicio(row.recorte_inicio ?? null);
    setFin(row.recorte_fin ?? null);
    setDuracion(null);
    setPausadoEn(null);
    setMensaje(null);
  }, [row.id, row.recorte_inicio, row.recorte_fin]);

  function marcarInicio(tiempo?: number) {
    const t = tiempo ?? videoRef.current?.currentTime;
    if (t !== undefined) setInicio(Math.round(t * 100) / 100);
  }
  function marcarFin(tiempo?: number) {
    const t = tiempo ?? videoRef.current?.currentTime;
    if (t !== undefined) setFin(Math.round(t * 100) / 100);
  }

  function tiempoDesdeX(clientX: number): number {
    const el = trackRef.current;
    if (!el || !duracion) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duracion * 100) / 100;
  }

  function handlersHandle(tipo: "inicio" | "fin") {
    return {
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setArrastrando(tipo);
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        if (arrastrando !== tipo || !duracion) return;
        const t = tiempoDesdeX(event.clientX);
        if (videoRef.current) videoRef.current.currentTime = t;
        if (tipo === "inicio") setInicio(Math.min(t, (fin ?? duracion) - 0.05));
        else setFin(Math.max(t, (inicio ?? 0) + 0.05));
      },
      onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setArrastrando(null);
      },
    };
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/aprobacion/accion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, accion: "recorte", recorte_inicio: inicio, recorte_fin: fin }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setMensaje(payload?.error ?? "No se pudo guardar el recorte.");
        setGuardando(false);
        return;
      }
      onGuardado();
    } catch {
      setMensaje("No se pudo guardar el recorte.");
      setGuardando(false);
    }
  }

  const pctInicio = duracion ? ((inicio ?? 0) / duracion) * 100 : 0;
  const pctFin = duracion ? ((fin ?? duracion) / duracion) * 100 : 100;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/40">
        Recorte manual del video original (para cuando el corte automatico no acierta)
      </p>
      <video
        ref={videoRef}
        src={`/api/aprobacion/original?id=${row.id}`}
        controls
        playsInline
        onLoadedMetadata={(event) => setDuracion(event.currentTarget.duration)}
        onPause={(event) => setPausadoEn(Math.round(event.currentTarget.currentTime * 100) / 100)}
        onPlay={() => setPausadoEn(null)}
        onSeeked={(event) => {
          if (event.currentTarget.paused) setPausadoEn(Math.round(event.currentTarget.currentTime * 100) / 100);
        }}
        className="mb-2 max-h-[220px] w-full rounded-lg bg-black"
      />

      {pausadoEn !== null ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-3 py-2 text-xs">
          <span className="text-[#67E8F9]">
            Pausado en <span className="font-mono">{formatearSegundos(pausadoEn)}</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => marcarInicio(pausadoEn)}
              className="rounded-md bg-[#8B5CF6]/20 px-2 py-1 font-semibold text-[#C4B5FD] transition hover:bg-[#8B5CF6]/30"
            >
              Usar como inicio
            </button>
            <button
              type="button"
              onClick={() => marcarFin(pausadoEn)}
              className="rounded-md bg-[#22D3EE]/20 px-2 py-1 font-semibold text-[#67E8F9] transition hover:bg-[#22D3EE]/30"
            >
              Usar como fin
            </button>
          </div>
        </div>
      ) : null}

      {duracion ? (
        <div
          ref={trackRef}
          className="relative mb-3 h-6 w-full touch-none select-none rounded-full bg-white/[0.08]"
        >
          <div
            className="absolute inset-y-0 rounded-full bg-[#8B5CF6]/35"
            style={{ left: `${pctInicio}%`, right: `${100 - pctFin}%` }}
          />
          <div
            {...handlersHandle("inicio")}
            className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-white bg-[#8B5CF6] shadow-lg"
            style={{ left: `${pctInicio}%` }}
            title="Arrastra para marcar el inicio"
          />
          <div
            {...handlersHandle("fin")}
            className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-white bg-[#22D3EE] shadow-lg"
            style={{ left: `${pctFin}%` }}
            title="Arrastra para marcar el fin"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] px-2 py-1.5">
          <span className="text-white/45">
            Inicio: <span className="font-mono text-white/80">{formatearSegundos(inicio)}</span>
          </span>
          <button
            type="button"
            onClick={() => marcarInicio()}
            className="rounded-md bg-[#8B5CF6]/15 px-2 py-1 text-[#C4B5FD] transition hover:bg-[#8B5CF6]/25"
          >
            Marcar aqui
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] px-2 py-1.5">
          <span className="text-white/45">
            Fin: <span className="font-mono text-white/80">{formatearSegundos(fin)}</span>
          </span>
          <button
            type="button"
            onClick={() => marcarFin()}
            className="rounded-md bg-[#8B5CF6]/15 px-2 py-1 text-[#C4B5FD] transition hover:bg-[#8B5CF6]/25"
          >
            Marcar aqui
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setInicio(null);
            setFin(null);
          }}
          className="text-[11px] text-white/40 transition hover:text-white/70"
        >
          Quitar marcas
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || (inicio === null && fin === null)}
          className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#7C3AED] disabled:opacity-40"
        >
          {guardando ? "Guardando..." : "Guardar y reprocesar"}
        </button>
      </div>
      {mensaje ? <p className="mt-2 text-[11px] text-red-300">{mensaje}</p> : null}
    </div>
  );
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
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [publicando, setPublicando] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeProgress, setChangeProgress] = useState(0);
  const [changeVideoError, setChangeVideoError] = useState<string | null>(null);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [quickLoadingId, setQuickLoadingId] = useState<string | null>(null);
  const [quickRehacer, setQuickRehacer] = useState<{ row: VideoRow; nota: string } | null>(null);

  useEffect(() => {
    setSeleccion(new Set());
    setRows(initialRows);
    setSelected(null);
    setRefOpen(false);
    setOriginalOpen(false);
    setActionMessage(null);
  }, [initialRows, currentEstado]);

  const modelosChips = useMemo(() => {
    const mapa = new Map<string, { clave: string; nombre: string; id: string | null; foto: number | null; total: number }>();
    for (const row of rows) {
      const clave = row.modelo_id ?? row.modelo_nombre;
      const previo = mapa.get(clave);
      if (previo) previo.total += 1;
      else mapa.set(clave, { clave, nombre: row.modelo_nombre, id: row.modelo_id ?? null, foto: row.modelo_foto ?? null, total: 1 });
    }
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows]);
  // Si la modelo filtrada se queda sin videos (ej. los acabas de marcar como publicados), vuelve a "Todas".
  const filtroModelo = modeloFiltro !== "todos" && !modelosChips.some((m) => m.clave === modeloFiltro) ? "todos" : modeloFiltro;
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const modeloOk = filtroModelo === "todos" || (row.modelo_id ?? row.modelo_nombre) === filtroModelo;
        const tipoOk = tipoFiltro === "todos" || row.tipo_video === tipoFiltro;
        return modeloOk && tipoOk;
      }),
    [rows, filtroModelo, tipoFiltro],
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
    setOriginalOpen(esTipo4 && videoBrutoAlternativas(row).length > 0);
    setActionMessage(null);
  }, []);

  const saveAndAct = useCallback(
    async (accion: "aprobar" | "rehacer" | "descartar" | "nueva_frase") => {
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
          const nuevoEstado = payload.estado ?? (accion === "aprobar" ? "aprobado" : accion === "descartar" ? "rechazado" : "editando");
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
                : accion === "nueva_frase"
                  ? "Video enviado a reprocesar con otra frase del banco."
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
    async (row: VideoRow, accion: "aprobar" | "descartar" | "rehacer" | "nueva_frase", notaRehacer?: string) => {
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
        const nuevoEstado = payload.estado ?? (accion === "aprobar" ? "aprobado" : accion === "descartar" ? "rechazado" : "editando");
        setRows((prev) =>
          nuevoEstado === currentEstado
            ? prev.map((item) => (item.id === row.id ? { ...item, estado: nuevoEstado } : item))
            : prev.filter((item) => item.id !== row.id),
        );
        setActionMessage(
          accion === "aprobar"
            ? mensajeAprobado(payload.programacion)
            : accion === "rehacer"
              ? "Video enviado a Rehacer IA."
              : accion === "nueva_frase"
                ? "Video enviado a reprocesar con otra frase del banco."
                : "Video descartado.",
        );
        router.refresh();
      } finally {
        setQuickLoadingId(null);
      }
    },
    [currentEstado, router],
  );


  const puedeMarcar = currentEstado === "aprobado" || currentEstado === "publicado";
  const seleccionVisible = filteredRows.filter((row) => seleccion.has(row.id));

  function alternarSeleccion(id: string) {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function alternarTodos() {
    setSeleccion((previa) =>
      filteredRows.length > 0 && filteredRows.every((row) => previa.has(row.id)) ? new Set() : new Set(filteredRows.map((row) => row.id)),
    );
  }

  async function marcarPublicado(ids: string[], publicado: boolean) {
    if (!ids.length) return;
    setPublicando(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/aprobacion/publicado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, publicado }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; cambiados?: string[] } | null;
      if (!res.ok) {
        setActionMessage(payload?.error ?? "No se pudo actualizar.");
        return;
      }
      const cambiados = new Set(payload?.cambiados ?? ids);
      setRows((previas) => previas.filter((row) => !cambiados.has(row.id)));
      setSeleccion(new Set());
      setActionMessage(
        publicado
          ? `${cambiados.size} video${cambiados.size === 1 ? "" : "s"} marcado${cambiados.size === 1 ? "" : "s"} como publicado${cambiados.size === 1 ? "" : "s"}.`
          : `${cambiados.size} video${cambiados.size === 1 ? "" : "s"} vuelto${cambiados.size === 1 ? "" : "s"} a aprobados.`,
      );
      router.refresh();
    } finally {
      setPublicando(false);
    }
  }

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
        <select
          value={tipoFiltro}
          onChange={(event) => setTipoFiltro(event.target.value)}
          className="input-base min-w-0 py-1.5 text-xs sm:w-auto"
        >
          {TIPO_FILTROS.map((tipo) => (
            <option key={tipo.value} value={tipo.value}>
              {tipo.label}
            </option>
          ))}
        </select>

        {modelosChips.length > 0 ? (
          <div className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setModeloFiltro("todos")}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filtroModelo === "todos" ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white/80"
              }`}
            >
              Todas
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{rows.length}</span>
            </button>
            {modelosChips.map((m) => (
              <button
                key={m.clave}
                type="button"
                onClick={() => setModeloFiltro(filtroModelo === m.clave ? "todos" : m.clave)}
                aria-pressed={filtroModelo === m.clave}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition ${
                  filtroModelo === m.clave ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/25 text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white/80"
                }`}
              >
                <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-6 w-6 text-[10px]" />
                {m.nombre}
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{m.total}</span>
              </button>
            ))}
          </div>
        ) : null}

        {puedeMarcar && filteredRows.length ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                checked={filteredRows.length > 0 && filteredRows.every((row) => seleccion.has(row.id))}
                onChange={alternarTodos}
                className="h-4 w-4 accent-[#8B5CF6]"
              />
              Seleccionar todos ({filteredRows.length})
            </label>
            <button
              type="button"
              disabled={publicando || seleccionVisible.length === 0}
              onClick={() => marcarPublicado(seleccionVisible.map((row) => row.id), currentEstado === "aprobado")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                currentEstado === "aprobado"
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
              }`}
            >
              {publicando
                ? "..."
                : currentEstado === "aprobado"
                  ? `✓ Marcar ${seleccionVisible.length || ""} como publicados`.replace("  ", " ")
                  : `↺ Volver ${seleccionVisible.length || ""} a aprobados`.replace("  ", " ")}
            </button>
          </div>
        ) : null}
      </div>

      {filteredRows.length === 0 ? (
        <div className="grid min-h-[55vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-white/35">
          Sin videos en esta cola
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] md:max-h-[calc(100vh-230px)] md:overflow-y-auto">
          {filteredRows.map((row) => {
            const url = videoEditado(row);
            const canQuickReview = row.estado === "en_aprobacion";
            const approveLoading = quickLoadingId === `${row.id}:aprobar`;
            const discardLoading = quickLoadingId === `${row.id}:descartar`;
            const remakeLoading = quickLoadingId === `${row.id}:rehacer`;
            const newPhraseLoading = quickLoadingId === `${row.id}:nueva_frase`;
            return (
              <div
                key={row.id}
                className="group grid w-full grid-cols-[58px_1fr] gap-3 border-b border-white/[0.06] p-3 text-left transition-all duration-150 last:border-b-0 hover:border-[#8B5CF6]/35 hover:bg-white/[0.055] sm:grid-cols-[68px_1fr_auto] sm:gap-4 sm:p-4"
              >
                <div className="relative h-24 w-[54px] sm:h-28 sm:w-[63px]">
                {puedeMarcar ? (
                  <label className="absolute left-1 top-1 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-black/70 ring-1 ring-white/25">
                    <input
                      type="checkbox"
                      checked={seleccion.has(row.id)}
                      onChange={() => alternarSeleccion(row.id)}
                      aria-label={`Seleccionar ${row.titulo ?? row.id}`}
                      className="h-4 w-4 accent-[#8B5CF6]"
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => openPopup(row)}
                  className="relative h-full w-full overflow-hidden rounded-xl bg-black text-left ring-1 ring-white/[0.08]"
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
                </div>

                <button type="button" onClick={() => openPopup(row)} className="min-w-0 self-center text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white/90 sm:text-base">{row.titulo ?? `#${row.id.slice(-6)}`}</p>
                    <span className={`badge px-2 py-0.5 text-[9px] sm:hidden ${ESTADO_BADGE[row.estado] ?? "badge"}`}>
                      {estadoLabel(row.estado)}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-2 truncate text-xs text-white/55">
                    <AvatarModelo id={row.modelo_id} nombre={row.modelo_nombre} foto={row.modelo_foto} className="h-6 w-6 text-[10px]" />
                    <span className="truncate">
                      {row.modelo_nombre}
                      {row.cuenta_username ? ` · @${row.cuenta_username}` : ""}
                    </span>
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
                  {(row.estado === "aprobado" || row.estado === "publicado") && row.programado_at ? (
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
                      {row.frase_quemada ? (
                        <button
                          type="button"
                          onClick={() => quickAct(row, "nueva_frase")}
                          disabled={Boolean(quickLoadingId)}
                          title="Vuelve a procesar el video con otra frase del banco (evita repetir esta misma)"
                          className="rounded-lg border border-[#8B5CF6]/35 bg-[#8B5CF6]/10 px-3 py-1.5 text-xs font-semibold text-[#C4B5FD] transition hover:border-[#8B5CF6]/70 hover:bg-[#8B5CF6]/20 disabled:opacity-40"
                        >
                          {newPhraseLoading ? "..." : "Nueva frase"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {row.estado === "aprobado" ? (
                    <button
                      type="button"
                      onClick={() => marcarPublicado([row.id], true)}
                      disabled={publicando}
                      className="rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400/70 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      ✓ Marcar publicado
                    </button>
                  ) : null}
                  {row.estado === "publicado" ? (
                    <button
                      type="button"
                      onClick={() => marcarPublicado([row.id], false)}
                      disabled={publicando}
                      className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-40"
                    >
                      ↺ Volver a aprobado
                    </button>
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
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/75 p-2 backdrop-blur-md sm:items-center sm:p-5" role="dialog" aria-modal="true">
          <div className="relative grid h-[calc(100dvh-1rem)] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0b0912]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:h-[94dvh] sm:rounded-3xl lg:grid-cols-[minmax(260px,420px)_1fr]">
            <button
              onClick={closePopup}
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/40 text-sm text-white/55 transition hover:border-white/20 hover:text-white"
              aria-label="Cerrar popup"
            >
              x
            </button>

            <div className="grid min-h-0 place-items-center bg-black p-2 sm:p-5">
              <div className="h-full max-h-[46dvh] w-auto overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 sm:max-h-[88dvh]">
                {videoEditado(selected) ? (
                  <video
                    key={selected.id}
                    src={videoEditado(selected)!}
                    controls
                    playsInline
                    autoPlay
                    className="h-full max-h-[46dvh] aspect-[9/16] object-contain sm:max-h-[88dvh]"
                  />
                ) : (
                  <div className="grid aspect-[9/16] h-full min-h-[360px] place-items-center text-xs text-white/25">
                    Sin video
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-white/[0.08] bg-white/[0.04] p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:p-4 lg:border-l lg:border-t-0">
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
                <p className="mt-1 text-[10px] text-white/25">
                  Esta nota queda de registro, pero no hay IA que la lea. Para ajustar el recorte al rehacer, escribe
                  algo como <span className="font-mono text-white/40">inicio +1.5</span> o{" "}
                  <span className="font-mono text-white/40">fin -0.5</span> (segundos a sumar/restar al recorte
                  actual) — para todo lo demas (frase, tamano de letra...) usa el recorte manual o &quot;Nueva
                  frase&quot; de arriba.
                </p>
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
                      // Subida directa a R2 con URL firmada: el archivo llega byte a byte, sin pasar por el servidor
                      // (que limita a ~4,5 MB) y sin recomprimirse. Despues se registra como el video editado.
                      const ext = (f.name.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
                      const key = `editados/${selected.id}/${crypto.randomUUID()}.${ext}`;
                      const contentType = f.type || "video/mp4";
                      const firma = await fetch("/api/r2/presign", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key, contentType }),
                      });
                      const firmado = (await firma.json().catch(() => ({}))) as { url?: string; error?: string };
                      if (!firma.ok || !firmado.url) throw new Error(firmado.error ?? "No se pudo preparar la subida");
                      await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.upload.addEventListener("progress", (ev) => {
                          if (ev.lengthComputable) setChangeProgress(Math.round((ev.loaded / ev.total) * 100));
                        });
                        xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`La subida falló (${xhr.status})`))));
                        xhr.addEventListener("error", () => reject(new Error("Error de red al subir el video")));
                        xhr.open("PUT", firmado.url as string);
                        xhr.setRequestHeader("Content-Type", contentType);
                        xhr.send(f);
                      });
                      const registro = await fetch("/api/aprobacion/cambiar-video", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: selected.id, key }),
                      });
                      if (!registro.ok) throw new Error(((await registro.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo registrar el video");
                      if (changeFileRef.current) changeFileRef.current.value = "";
                      router.refresh();
                      closePopup();
                    } catch (err) {
                      setChangeVideoError(err instanceof Error ? err.message : "Error al cambiar el video");
                    } finally {
                      setChangeLoading(false);
                      setChangeProgress(0);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={changeLoading}
                  onClick={() => changeFileRef.current?.click()}
                  className="btn-secondary flex w-fit items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  {changeLoading ? `Subiendo${changeProgress ? ` ${changeProgress}%` : "..."}` : "↺ Cambiar video"}
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
                    <OriginalSinEditar
                      row={selected}
                      abierto={originalOpen}
                      onAbrir={() => setOriginalOpen(true)}
                      onCerrar={() => setOriginalOpen(false)}
                    />
                  </div>
                </div>

                {["tipo1", "tipo3", "tipo4"].includes(selected.tipo_video ?? "") ? (
                  <div className="mt-3">
                    <RecorteManualEditor
                      row={selected}
                      onGuardado={() => {
                        setRows((prev) => prev.filter((row) => row.id !== selected.id));
                        setActionMessage("Video enviado a reprocesar con el recorte manual.");
                        router.refresh();
                        closePopup();
                      }}
                    />
                  </div>
                ) : null}
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
                {selected.estado === "en_aprobacion" ? (
                  <>
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
                    {selected.frase_quemada ? (
                      <button
                        onClick={() => saveAndAct("nueva_frase")}
                        disabled={loading}
                        title="Vuelve a procesar el video con otra frase del banco (evita repetir esta misma)"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 py-2.5 text-sm font-semibold text-[#C4B5FD] transition-all hover:border-[#8B5CF6]/60 hover:bg-[#8B5CF6]/20 disabled:opacity-40"
                      >
                        ⟳ Nueva frase
                      </button>
                    ) : null}
                  </>
                ) : null}
                <a
                  href={`/api/descargar?id=${selected.id}&tipo=original`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 py-2.5 text-sm font-semibold text-amber-400 transition-all hover:bg-amber-950/50 hover:text-amber-300"
                >
                  ↓ Editar yo <span className="text-[9px] font-normal opacity-60">(descarga original)</span>
                </a>
                {selected.estado === "en_aprobacion" ? (
                  <button
                    onClick={() => saveAndAct("descartar")}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-900/40 bg-red-950/40 py-2.5 text-sm font-semibold text-red-400 transition-all hover:bg-red-950/60 hover:text-red-300 disabled:opacity-40"
                  >
                    x Descartar <kbd className="rounded bg-red-900/40 px-1.5 text-[9px] font-normal">X</kbd>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quickRehacer ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="glass-card w-full max-w-lg p-5">
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
              placeholder="Queda de registro (no hay IA leyendola). Para ajustar el recorte: inicio +1.5 / fin -0.5"
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
