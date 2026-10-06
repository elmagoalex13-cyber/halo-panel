"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { AvatarModelo } from "@/components/AvatarModelo";
import { GlassCard } from "@/components/GlassCard";
import { formatDate } from "@/lib/utils";
import { nombreTipo } from "@/lib/tiposEdicion";

export type PiezaDeOriginal = {
  id: string;
  estado: string;
  proceso: string | null;
  error: string | null;
  tipo: string | null;
  tieneEditado: boolean;
  fragmento: number | null;
};

export type Original = {
  id: string; // pieza mas reciente (sirve para ver/descargar el original)
  modelo_id: string | null;
  modelo_nombre: string;
  foto: number | null;
  archivo: string;
  tamano: number | null;
  recibido_at: string;
  piezas: PiezaDeOriginal[];
};

type EstadoClave = "error" | "editando" | "revisar" | "aprobado" | "publicado" | "descartado";

const ESTADOS: Record<EstadoClave, { label: string; clase: string }> = {
  error: { label: "Error al editar", clase: "border-red-500/40 bg-red-500/10 text-red-300" },
  editando: { label: "Editando", clase: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  revisar: { label: "Para revisar", clase: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  aprobado: { label: "Aprobado", clase: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  publicado: { label: "Publicado", clase: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  descartado: { label: "Descartado", clase: "border-white/15 bg-white/[0.04] text-white/45" },
};

function estadoPieza(p: PiezaDeOriginal): EstadoClave {
  if (p.proceso === "error") return "error";
  if (p.estado === "publicado") return "publicado";
  if (p.estado === "aprobado") return "aprobado";
  if (p.estado === "en_aprobacion") return "revisar";
  if (p.estado === "rechazado" || p.estado === "descartado") return "descartado";
  return "editando";
}

// Prioridad al mostrar el estado de un original que tiene varias piezas: lo que pide atencion primero.
const PRIORIDAD: EstadoClave[] = ["error", "editando", "revisar", "aprobado", "publicado", "descartado"];
const estadoOriginal = (o: Original): EstadoClave => {
  const todos = o.piezas.map(estadoPieza);
  return PRIORIDAD.find((e) => todos.includes(e)) ?? "editando";
};
// "Resuelto" = ya no hace falta el original para nada (nadie lo va a rehacer): lo normal es borrarlo.
const RESUELTOS: EstadoClave[] = ["aprobado", "publicado", "descartado"];

function tamano(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

function antiguedad(fecha: string) {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  return dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
}

// Primer fotograma del video original para reconocerlo de un vistazo. Solo se pide cuando la tarjeta entra en
// pantalla (son muchos videos y pesan). El archivo se sirve tal cual, sin recomprimir.
function VistaPrevia({ id }: { id: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={caja} className="aspect-[9/16] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      {visible && !fallo ? (
        <video
          src={`/api/aprobacion/original?id=${id}#t=0.5`}
          controls
          muted
          playsInline
          preload="metadata"
          onError={() => setFallo(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="grid h-full place-items-center px-3 text-center text-[11px] text-white/30">
          {fallo ? "Tu navegador no puede mostrar este formato (suele pasar con .MOV de iPhone). Descárgalo con «Original»." : "Cargando…"}
        </div>
      )}
    </div>
  );
}

export function OriginalesClient({
  originales,
  modelos,
}: {
  originales: Original[];
  modelos: Array<{ id: string; nombre: string; foto: number | null }>;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(originales);
  useEffect(() => setLista(originales), [originales]);

  const [modelo, setModelo] = useState("todas");
  const [estado, setEstado] = useState<"todos" | EstadoClave>("todos");
  const [edad, setEdad] = useState(0);
  const [busca, setBusca] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  // Si el modelo elegido ya no tiene videos, el filtro vuelve solo a "todas".
  const modeloActivo = modelo !== "todas" && !lista.some((o) => o.modelo_id === modelo) ? "todas" : modelo;
  const modelosConVideos = modelos.filter((m) => lista.some((o) => o.modelo_id === m.id));

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const limite = edad ? Date.now() - edad * 86400000 : null;
    return lista
      .filter((o) => modeloActivo === "todas" || o.modelo_id === modeloActivo)
      .filter((o) => estado === "todos" || estadoOriginal(o) === estado)
      .filter((o) => limite === null || new Date(o.recibido_at).getTime() <= limite)
      .filter((o) => !q || o.archivo.toLowerCase().includes(q) || o.modelo_nombre.toLowerCase().includes(q));
  }, [lista, modeloActivo, estado, edad, busca]);

  const conteo = (e: EstadoClave) => lista.filter((o) => estadoOriginal(o) === e).length;
  const totalBytes = (xs: Original[]) => xs.reduce((s, o) => s + (o.tamano ?? 0), 0);
  const hace24h = Date.now() - 24 * 3600000;

  const elegidosVivos = elegidos.filter((id) => lista.some((o) => o.id === id));
  const objetos = lista.filter((o) => elegidosVivos.includes(o.id));
  const conPendientes = objetos.filter((o) => !RESUELTOS.includes(estadoOriginal(o)));
  const alternar = (id: string) => setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const resueltosVisibles = visibles.filter((o) => RESUELTOS.includes(estadoOriginal(o)));

  async function borrar() {
    setBorrando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/originales", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: elegidosVivos }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; borrados?: number; resultados?: Array<{ id: string; ok: boolean; motivo?: string }> };
      if (!res.ok && !j.resultados) throw new Error(j.error ?? "No se pudo borrar");
      const hechos = new Set((j.resultados ?? []).filter((r) => r.ok).map((r) => r.id));
      const fallos = (j.resultados ?? []).filter((r) => !r.ok);
      setLista((prev) => prev.filter((o) => !hechos.has(o.id)));
      setElegidos((prev) => prev.filter((id) => !hechos.has(id)));
      setMensaje({
        ok: fallos.length === 0,
        texto: `${hechos.size} original${hechos.size === 1 ? "" : "es"} borrado${hechos.size === 1 ? "" : "s"}${fallos.length ? ` · ${fallos.length} no se pudo${fallos.length === 1 ? "" : "ieron"} borrar: ${fallos[0].motivo}` : "."}`,
      });
      router.refresh();
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : "No se pudo borrar" });
    } finally {
      setBorrando(false);
      setConfirmando(false);
    }
  }

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80"}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50">
        {lista.length} original{lista.length === 1 ? "" : "es"} guardado{lista.length === 1 ? "" : "s"} · {tamano(totalBytes(lista)) ?? "0 MB"} ocupados
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModelo("todas")} className={chip(modeloActivo === "todas")}>
          Todas las modelos ({lista.length})
        </button>
        {modelosConVideos.map((m) => (
          <button key={m.id} onClick={() => setModelo(m.id)} className={`${chip(modeloActivo === m.id)} flex items-center gap-1.5`}>
            <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-4 w-4 text-[8px]" />
            {m.nombre} ({lista.filter((o) => o.modelo_id === m.id).length})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEstado("todos")} className={chip(estado === "todos")}>
          Cualquier estado
        </button>
        {PRIORIDAD.filter((e) => conteo(e) > 0).map((e) => (
          <button key={e} onClick={() => setEstado(e)} className={chip(estado === e)}>
            {ESTADOS[e].label} ({conteo(e)})
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <select value={edad} onChange={(e) => setEdad(Number(e.target.value))} className="input-base py-1.5 text-xs">
            <option value={0}>Cualquier antigüedad</option>
            <option value={15}>De hace más de 15 días</option>
            <option value={30}>De hace más de 30 días</option>
            <option value={60}>De hace más de 60 días</option>
            <option value={90}>De hace más de 90 días</option>
          </select>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por archivo…" className="input-base w-full py-1.5 text-xs sm:w-52" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/55">
        <span>
          {elegidosVivos.length
            ? `${elegidosVivos.length} elegido${elegidosVivos.length === 1 ? "" : "s"} · ${tamano(totalBytes(objetos)) ?? "0 MB"}`
            : "Marca los videos que quieras borrar con la casilla de cada tarjeta."}
        </span>
        <button
          onClick={() => setElegidos(Array.from(new Set([...elegidosVivos, ...resueltosVisibles.map((o) => o.id)])))}
          disabled={!resueltosVisibles.length}
          className="text-[#A78BFA] hover:underline disabled:opacity-40 disabled:no-underline"
          title="Aprobados, publicados o descartados: ya no hace falta el original"
        >
          Elegir los {resueltosVisibles.length} ya resueltos
        </button>
        {elegidosVivos.length ? (
          <>
            <button onClick={() => setElegidos([])} className="hover:text-white hover:underline">
              Quitar selección
            </button>
            <button
              onClick={() => setConfirmando(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-1.5 font-semibold text-red-300 transition hover:bg-red-950/70"
            >
              <Trash2 className="h-3.5 w-3.5" /> Borrar {elegidosVivos.length} original{elegidosVivos.length === 1 ? "" : "es"}
            </button>
          </>
        ) : null}
      </div>
      {mensaje ? (
        <p className={`rounded-xl border px-3 py-2 text-xs ${mensaje.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>{mensaje.texto}</p>
      ) : null}

      {visibles.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {lista.length === 0 ? "No hay originales guardados." : "Ningún video con esos filtros."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((o) => {
            const e = estadoOriginal(o);
            const editada = o.piezas.find((p) => p.tieneEditado);
            const numTipo = o.piezas[0]?.tipo?.match(/[1-4]/)?.[0];
            const errorMsg = o.piezas.find((p) => p.error)?.error;
            const marcado = elegidosVivos.includes(o.id);
            return (
              <article key={o.id} className={`flex flex-col gap-2 rounded-2xl border p-2.5 transition ${marcado ? "border-red-500/50 bg-red-500/[0.06]" : "border-white/[0.08] bg-white/[0.03]"}`}>
                <div className="relative">
                  <VistaPrevia id={o.id} />
                  <label className="absolute left-2 top-2 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-black/70 backdrop-blur" title="Elegir para borrar">
                    <input type="checkbox" checked={marcado} onChange={() => alternar(o.id)} className="h-4 w-4 cursor-pointer accent-red-500" />
                  </label>
                  {new Date(o.recibido_at).getTime() >= hace24h ? (
                    <span className="absolute right-2 top-2 rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] font-semibold text-white">Nuevo</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                  <AvatarModelo id={o.modelo_id} nombre={o.modelo_nombre} foto={o.foto} className="h-5 w-5 text-[9px]" />
                  <span className="truncate">{o.modelo_nombre}</span>
                </div>
                <div>
                  <p className="truncate text-xs text-white/70" title={o.archivo}>{o.archivo}</p>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    {formatDate(o.recibido_at, { day: "numeric", month: "short" })} · {antiguedad(o.recibido_at)}
                    {tamano(o.tamano) ? ` · ${tamano(o.tamano)}` : ""}
                  </p>
                  <p className="text-[11px] text-white/35">
                    {numTipo ? `Tipo ${numTipo} ${nombreTipo(Number(numTipo))}` : "Sin tipo"}
                    {o.piezas.length > 1 ? ` · ${o.piezas.length} piezas` : ""}
                  </p>
                </div>
                <span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADOS[e].clase}`}>{ESTADOS[e].label}</span>
                {errorMsg ? <p className="line-clamp-2 text-[10px] text-red-300/80">{errorMsg}</p> : null}
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <a
                    href={`/api/descargar?id=${o.id}&tipo=original`}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2 py-1.5 text-[11px] font-semibold text-amber-400 transition hover:bg-amber-950/50"
                  >
                    <Download className="h-3 w-3" /> Original
                  </a>
                  {editada ? (
                    <a
                      href={`/api/descargar?id=${editada.id}&tipo=editado`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-2 py-1.5 text-[11px] font-semibold text-[#A78BFA] transition hover:bg-[#8B5CF6]/20"
                    >
                      <Download className="h-3 w-3" /> Editado
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="text-xs text-white/30">
        Las descargas son el archivo tal cual está guardado, sin recomprimir. Para revisar, aprobar o rehacer las versiones editadas ve a{" "}
        <Link href="/aprobacion" className="text-[#A78BFA] hover:underline">Aprobación</Link>.
      </p>

      {confirmando ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-md space-y-4 p-5">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">
                ¿Borrar {elegidosVivos.length} original{elegidosVivos.length === 1 ? "" : "es"}?
              </h3>
              <p className="mt-1 text-sm text-white/55">
                Se elimina el archivo que grabó la modelo ({tamano(totalBytes(objetos)) ?? "0 MB"}). <strong className="text-white/80">No se puede deshacer.</strong> Los videos
                editados, su estado y las publicaciones se conservan.
              </p>
            </div>
            {conPendientes.length ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                {conPendientes.length === 1 ? "Uno de ellos aún está" : `${conPendientes.length} de ellos aún están`} sin resolver (
                {Array.from(new Set(conPendientes.map((o) => ESTADOS[estadoOriginal(o)].label.toLowerCase()))).join(", ")}). Sin el original no podrás rehacerlos ni
                descargar el original para editarlos a mano.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmando(false)} disabled={borrando} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={borrar}
                disabled={borrando}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {borrando ? "Borrando…" : "Sí, borrar"}
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
