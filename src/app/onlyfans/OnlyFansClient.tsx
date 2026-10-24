"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AvatarModelo } from "@/components/AvatarModelo";
import { ETIQUETA_TIPO, estadoRevision, formatoTamano, type TipoColeccion } from "@/lib/onlyfans";
import type { ResumenColeccion } from "@/lib/ofResumen";
import type { FotosPerfilVistas } from "@/lib/fotosPerfil";
import { FotosPerfilModelo } from "@/components/FotosPerfilPanel";
import { SelectorAmbito, ambitoCoincide, type FiltroAmbito } from "@/components/SelectorAmbito";

const CLAVE_VISTA = "of_vista"; // la vista que tenias (modelo, pestaña, filtros)
const CLAVE_VOLVER = "of_volver"; // 1 = acabas de abrir un script/pack/post: al volver se recupera la vista
const alAbrir = () => {
  try {
    sessionStorage.setItem(CLAVE_VOLVER, "1");
  } catch {
    /* sin almacenamiento */
  }
};

export function OnlyFansClient({
  modelos: modelosTodas,
  colecciones: coleccionesTodas,
  modeloInicial,
  tipoInicial,
  estadoInicial,
  ambitoInicial,
  fotosPerfil: fotosPerfilInicial,
  sinFiltroModelo = false,
  esDueno = false,
  ambitos = {},
}: {
  esDueno?: boolean;
  ambitos?: Record<string, string>;
  modelos: Array<{ id: string; nombre: string; foto: number | null }>;
  colecciones: ResumenColeccion[];
  modeloInicial?: string;
  tipoInicial?: string;
  estadoInicial?: string;
  ambitoInicial?: string;
  fotosPerfil?: Record<string, FotosPerfilVistas>; // si viene, sale la pestaña «Perfil y banner»
  sinFiltroModelo?: boolean; // dentro de la ficha de una modelo ya esta filtrado
}) {
  // La lista vive en el cliente: borrar, renombrar, marcar o anotar actualiza la tarjeta en su sitio, sin recargar nada
  const [lista, setLista] = useState<ResumenColeccion[]>(coleccionesTodas);
  const [fotosPerfil, setFotosPerfil] = useState(fotosPerfilInicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; tipo: "renombrar" | "nota"; texto: string } | null>(null);
  const [filtroAmbito, setFiltroAmbito] = useState<FiltroAmbito>(ambitoInicial === "mias" || ambitoInicial === "compartidas" ? ambitoInicial : "todas");
  // Con el selector del dueño (mis modelos / con mi socio) solo quedan las modelos de ese grupo y su contenido
  const modelos = modelosTodas.filter((m) => ambitoCoincide(filtroAmbito, ambitos[m.id]));
  const colecciones = lista.filter((c) => ambitoCoincide(filtroAmbito, ambitos[c.modelo_id]));
  const [modelo, setModelo] = useState(modeloInicial && modelosTodas.some((m) => m.id === modeloInicial) ? modeloInicial : "todas");
  const [verPerfil, setVerPerfil] = useState(Boolean(fotosPerfil) && tipoInicial === "perfil");
  const [tipo, setTipo] = useState<TipoColeccion>(tipoInicial === "pack" || tipoInicial === "post" ? tipoInicial : "script");
  const [estado, setEstado] = useState<"todos" | "entregado" | "en_curso" | "por_subir" | "por_revisar" | "a_mejorar" | "aprobados">(
    estadoInicial === "entregado" || estadoInicial === "en_curso" || estadoInicial === "por_subir" || estadoInicial === "por_revisar" || estadoInicial === "a_mejorar" || estadoInicial === "aprobados" ? estadoInicial : "todos",
  );

  // Al volver de abrir un script, pack o post (con «← OnlyFans» o con el «atrás» del navegador) la pagina puede llegar tal como estaba al entrar,
  // sin la modelo ni la pestaña que habias elegido: se recuperan de lo guardado (solo si se vuelve de abrir uno y la direccion no trae su propia vista)
  useEffect(() => {
    if (sinFiltroModelo) return;
    try {
      if (sessionStorage.getItem(CLAVE_VOLVER) !== "1") return;
      sessionStorage.removeItem(CLAVE_VOLVER);
      if (modeloInicial || tipoInicial || estadoInicial || ambitoInicial) return;
      const v = JSON.parse(sessionStorage.getItem(CLAVE_VISTA) ?? "null") as { modelo?: string; tipo?: string; verPerfil?: boolean; estado?: string; ambito?: string } | null;
      if (!v) return;
      if (v.modelo && v.modelo !== "todas" && modelosTodas.some((m) => m.id === v.modelo)) setModelo(v.modelo);
      if (v.verPerfil && fotosPerfilInicial) setVerPerfil(true);
      else if (v.tipo === "pack" || v.tipo === "post" || v.tipo === "script") setTipo(v.tipo);
      if (v.estado === "entregado" || v.estado === "en_curso" || v.estado === "por_subir") setEstado(v.estado);
      if (v.ambito === "mias" || v.ambito === "compartidas") setFiltroAmbito(v.ambito);
    } catch {
      /* sin almacenamiento: se queda la vista por defecto */
    }
    // solo al entrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lo que estas viendo (modelo, pestaña, estado, grupo) queda en la direccion: al abrir un script y volver, o al recargar, sigues donde estabas
  useEffect(() => {
    if (sinFiltroModelo) return;
    const q = new URLSearchParams();
    if (modelo !== "todas") q.set("modelo", modelo);
    if (verPerfil) q.set("tipo", "perfil");
    else if (tipo !== "script") q.set("tipo", tipo);
    if (estado !== "todos") q.set("estado", estado);
    if (filtroAmbito !== "todas") q.set("ambito", filtroAmbito);
    const url = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", url);
    try {
      sessionStorage.setItem(CLAVE_VISTA, JSON.stringify({ modelo, tipo, verPerfil, estado, ambito: filtroAmbito }));
    } catch {
      /* sin almacenamiento */
    }
  }, [modelo, tipo, verPerfil, estado, filtroAmbito, sinFiltroModelo]);

  async function llamar(c: ResumenColeccion, url: string, init: RequestInit, alOk: (j: Record<string, unknown>) => void, fallo: string) {
    setOcupado(c.id);
    setAviso(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : fallo);
      alOk(j);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : fallo);
    } finally {
      setOcupado(null);
    }
  }
  const cambiar = (id: string, cambios: Partial<ResumenColeccion>) => setLista((p) => p.map((x) => (x.id === id ? { ...x, ...cambios } : x)));

  const borrar = (c: ResumenColeccion) => {
    if (!window.confirm(`¿Borrar «${c.nombre}» de ${c.modelo_nombre} y sus ${c.archivos} archivos (${formatoTamano(c.bytes) || "0 MB"})? No se puede deshacer.`)) return;
    void llamar(c, `/api/onlyfans/coleccion?id=${c.id}`, { method: "DELETE" }, () => setLista((p) => p.filter((x) => x.id !== c.id)), "No se pudo borrar");
  };
  const marcarSubido = (c: ResumenColeccion, subido: boolean) =>
    void llamar(c, "/api/onlyfans/marcar", { method: "POST", body: JSON.stringify({ coleccion_id: c.id, fase: null, subido }) }, () => cambiar(c.id, { subidosOF: subido ? c.archivos : 0 }), "No se pudo marcar");
  const renombrar = (c: ResumenColeccion, nombre: string) =>
    void llamar(c, "/api/onlyfans/coleccion", { method: "PATCH", body: JSON.stringify({ id: c.id, accion: "renombrar", nombre }) }, (j) => {
      cambiar(c.id, { nombre: typeof j.nombre === "string" ? j.nombre : nombre });
      setPanel(null);
    }, "No se pudo renombrar");
  const guardarNota = (c: ResumenColeccion, texto: string) =>
    void llamar(c, "/api/onlyfans/nota", { method: "POST", body: JSON.stringify({ coleccion_id: c.id, texto }) }, () => {
      cambiar(c.id, { nota: texto.trim() || null });
      setPanel(null);
    }, "No se pudo guardar la nota");

  // Todas las modelos, tengan o no contenido todavia (las que no, salen apagadas con un 0)
  const modeloActivo = modelo !== "todas" && !modelos.some((m) => m.id === modelo) ? "todas" : modelo;
  const delModelo = colecciones.filter((c) => modeloActivo === "todas" || c.modelo_id === modeloActivo);

  const visibles = useMemo(
    () =>
      delModelo
        .filter((c) => c.tipo === tipo)
        .filter((c) => {
          if (estado === "todos") return true;
          if (estado === "por_subir") return c.estado === "entregado" && c.subidosOF < c.archivos;
          // Revision de la agencia: «por revisar» = entregado sin feedback o repetido por la modelo despues de tu feedback
          if (estado === "por_revisar") return ["pendiente", "repetido"].includes(estadoRevision(c) ?? "");
          if (estado === "a_mejorar") return estadoRevision(c) === "mejorar";
          if (estado === "aprobados") return estadoRevision(c) === "aprobado";
          return c.estado === estado;
        }),
    [delModelo, tipo, estado],
  );

  const conteoTipo = (t: TipoColeccion) => delModelo.filter((c) => c.tipo === t).length;
  const sinDescargarTotal = delModelo.reduce((s, c) => s + c.sinDescargar, 0);
  const porSubirOF = delModelo.filter((c) => c.estado === "entregado" && c.subidosOF < c.archivos).length;
  const espacio = delModelo.reduce((s, c) => s + c.bytes, 0);

  // Selector de modelos «por prioridad»: con novedades, con contenido y sin contenido (plegadas), con buscador
  const [busqueda, setBusqueda] = useState("");
  const [verVacias, setVerVacias] = useState(false);
  const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const buscando = busqueda.trim() !== "";
  const encontradas = modelos.filter((m) => !buscando || sinAcentos(m.nombre).includes(sinAcentos(busqueda.trim())));
  const resumenDe = (id: string) => {
    const n = colecciones.filter((c) => c.modelo_id === id);
    return { total: n.length, nuevos: n.filter((c) => c.nuevo).length };
  };
  const conNovedades = encontradas.filter((m) => resumenDe(m.id).nuevos > 0).sort((a, b) => resumenDe(b.id).nuevos - resumenDe(a.id).nuevos || a.nombre.localeCompare(b.nombre, "es"));
  const conContenido = encontradas.filter((m) => resumenDe(m.id).total > 0 && resumenDe(m.id).nuevos === 0).sort((a, b) => resumenDe(b.id).total - resumenDe(a.id).total || a.nombre.localeCompare(b.nombre, "es"));
  const sinContenido = encontradas.filter((m) => resumenDe(m.id).total === 0).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  // Las vacías se abren solas al buscar o si la modelo elegida es una de ellas
  const vaciasAbiertas = verVacias || buscando || sinContenido.some((m) => m.id === modeloActivo);
  const chipModelo = (m: { id: string; nombre: string; foto: number | null }, conBadge: boolean) => {
    const r = resumenDe(m.id);
    return (
      <button key={m.id} onClick={() => setModelo(m.id)} className={`${chip(modeloActivo === m.id)} flex items-center gap-1.5 ${r.total ? "" : "opacity-60"}`}>
        <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-4 w-4 text-[8px]" />
        {m.nombre} ({r.total})
        {conBadge && r.nuevos ? <span className="rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] text-white">{r.nuevos} nuevo{r.nuevos === 1 ? "" : "s"}</span> : null}
      </button>
    );
  };

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80"}`;

  return (
    <div className="space-y-4">
      {sinFiltroModelo ? null : (
        <SelectorAmbito esDueno={esDueno} valor={filtroAmbito} onChange={setFiltroAmbito} cuenta={(f) => modelosTodas.filter((m) => ambitoCoincide(f, ambitos[m.id])).length} />
      )}
      {sinFiltroModelo ? null : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setModelo("todas")} className={chip(modeloActivo === "todas")}>
              Todas las modelos ({colecciones.length})
              {colecciones.some((c) => c.nuevo) ? <span className="ml-1.5 rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] text-white">{colecciones.filter((c) => c.nuevo).length} nuevo{colecciones.filter((c) => c.nuevo).length === 1 ? "" : "s"}</span> : null}
            </button>
            <div className="relative ml-auto w-full sm:w-64">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBusqueda("");
                  if (e.key === "Enter" && encontradas.length === 1) {
                    setModelo(encontradas[0].id);
                    setBusqueda("");
                  }
                }}
                placeholder="Buscar modelo…"
                aria-label="Buscar modelo"
                className="input-base w-full py-1.5 pr-8 text-xs"
              />
              {busqueda ? (
                <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white">
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          {buscando && !encontradas.length ? <p className="rounded-xl border border-white/[0.06] px-3 py-2 text-xs text-white/40">Ninguna modelo se llama «{busqueda}».</p> : null}

          {conNovedades.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.07] p-2">
              <span className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#C4B5FD]">🔔 Con novedades</span>
              {conNovedades.map((m) => chipModelo(m, true))}
            </div>
          ) : null}
          {conContenido.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
              <span className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-white/40">📦 Con contenido</span>
              {conContenido.map((m) => chipModelo(m, false))}
            </div>
          ) : null}
          {sinContenido.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.04] p-2">
              <button onClick={() => setVerVacias(!verVacias)} disabled={buscando} className="w-32 shrink-0 text-left text-[11px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/60 disabled:cursor-default">
                ◌ Sin contenido ({sinContenido.length}) {buscando ? "" : vaciasAbiertas ? "▲" : "▼"}
              </button>
              {vaciasAbiertas ? sinContenido.map((m) => chipModelo(m, false)) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-xs text-white/45">Por subir a OnlyFans</p>
          <p className="mt-1 text-2xl font-semibold text-white">{porSubirOF}</p>
          <p className="text-xs text-white/35">entregados que aún no has marcado como subidos</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-xs text-white/45">Archivos sin descargar</p>
          <p className="mt-1 text-2xl font-semibold text-white">{sinDescargarTotal}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-xs text-white/45">Espacio ocupado</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatoTamano(espacio) || "0 MB"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08]">
        {(["script", "pack", "post"] as TipoColeccion[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setVerPerfil(false);
              setTipo(t);
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition ${!verPerfil && tipo === t ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"}`}
          >
            {ETIQUETA_TIPO[t]} <span className="text-xs opacity-60">{conteoTipo(t)}</span>
          </button>
        ))}
        {fotosPerfil ? (
          <button
            onClick={() => setVerPerfil(true)}
            className={`px-4 py-2.5 text-sm font-semibold transition ${verPerfil ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"}`}
          >
            Perfil y banner <span className="text-xs opacity-60">{modelos.filter((m) => fotosPerfil[m.id]?.perfil && fotosPerfil[m.id]?.banner).length}/{modelos.length}</span>
          </button>
        ) : null}
        <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className={`input-base ml-auto py-1.5 text-xs ${verPerfil ? "hidden" : ""}`}>
          <option value="todos">Cualquier estado</option>
          <option value="en_curso">En curso (la modelo lo está subiendo)</option>
          <option value="entregado">Entregados</option>
          <option value="por_subir">Entregados · por subir a OnlyFans</option>
          <option value="por_revisar">Por revisar (entregados sin feedback o repetidos)</option>
          <option value="a_mejorar">A mejorar (les diste feedback)</option>
          <option value="aprobados">Aprobados</option>
        </select>
      </div>

      {verPerfil && fotosPerfil ? (
        <PerfilYBanner modelos={modelos.filter((m) => modeloActivo === "todas" || m.id === modeloActivo)} fotos={fotosPerfil} onCambio={(id, f) => setFotosPerfil((p) => ({ ...(p ?? {}), [id]: f }))} />
      ) : visibles.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {colecciones.length === 0 ? "Todavía no han subido nada. Las modelos lo hacen desde su portal, en la pestaña «Contenido OnlyFans»." : "Nada con esos filtros."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const todoSubido = c.archivos > 0 && c.subidosOF >= c.archivos;
            const ocupadoAqui = ocupado === c.id;
            const abierta = panel?.id === c.id ? panel : null;
            return (
              <div key={c.id} className="flex flex-col gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]">
                {abierta?.tipo === "renombrar" ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renombrar(c, abierta.texto);
                    }}
                  >
                    <input autoFocus value={abierta.texto} onChange={(e) => setPanel({ ...abierta, texto: e.target.value })} maxLength={120} className="input-base min-w-0 flex-1 py-1 text-sm" />
                    <button type="submit" disabled={ocupadoAqui || !abierta.texto.trim()} className="rounded-lg bg-[#8B5CF6] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">Guardar</button>
                    <button type="button" onClick={() => setPanel(null)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/60 hover:text-white">Cancelar</button>
                  </form>
                ) : (
                  <Link href={`/onlyfans/${c.id}`} onClick={alAbrir} className="flex items-center gap-2">
                    <AvatarModelo id={c.modelo_id} nombre={c.modelo_nombre} foto={modelos.find((m) => m.id === c.modelo_id)?.foto ?? null} className="h-7 w-7 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{c.nombre}</p>
                      <p className="text-xs text-white/40">{c.modelo_nombre} · {new Date(c.entregado_at ?? c.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p>
                    </div>
                    {c.nuevo ? <span className="shrink-0 rounded-full bg-[#8B5CF6] px-2 py-0.5 text-[11px] font-semibold text-white">Nuevo</span> : null}
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.estado === "entregado" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                      {c.estado === "entregado" ? "Entregado" : "En curso"}
                    </span>
                  </Link>
                )}
                <Link href={`/onlyfans/${c.id}`} onClick={alAbrir} className="space-y-2.5">
                  <p className="text-xs text-white/50">
                    {c.fasesCompletas !== null ? `${c.fasesCompletas}/8 fases completas · ` : ""}
                    {c.videos} vídeo{c.videos === 1 ? "" : "s"} · {c.fotos} foto{c.fotos === 1 ? "" : "s"} · {formatoTamano(c.bytes) || "0 MB"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {c.sinDescargar > 0 ? <span className="rounded-full bg-[#8B5CF6]/20 px-2 py-0.5 text-[#c4b5fd]">{c.sinDescargar} sin descargar</span> : null}
                    {todoSubido ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">Subido a OnlyFans</span>
                    ) : c.subidosOF > 0 ? (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">{c.subidosOF}/{c.archivos} subidos a OnlyFans</span>
                    ) : null}
                  </div>
                </Link>

                {(() => {
                  const r = estadoRevision(c);
                  if (r === "aprobado")
                    return (
                      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1.5 text-xs text-emerald-100/90">
                        <span className="font-semibold text-emerald-300">✅ Aprobado</span>
                        {c.revision_texto ? <span className="mt-0.5 block whitespace-pre-wrap text-emerald-100/70">💬 {c.revision_texto}</span> : null}
                      </div>
                    );
                  if (r === "mejorar")
                    return (
                      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-1.5 text-xs text-amber-100/90">
                        <span className="font-semibold text-amber-300">⚠️ A mejorar · esperando que lo repita</span>
                        {c.revision_texto ? <span className="mt-0.5 block whitespace-pre-wrap text-amber-100/80">💬 {c.revision_texto}</span> : <span className="mt-0.5 block text-amber-100/50">(sin comentario)</span>}
                      </div>
                    );
                  if (r === "repetido")
                    return (
                      <div className="rounded-lg border border-sky-400/30 bg-sky-400/[0.08] px-2.5 py-1.5 text-xs text-sky-100/90">
                        <span className="font-semibold text-sky-300">🔁 La modelo lo ha repetido · revísalo de nuevo</span>
                        {c.revision_texto ? <span className="mt-0.5 block whitespace-pre-wrap text-sky-100/60">Tu feedback anterior ({c.revision === "aprobado" ? "aprobado" : "a mejorar"}): {c.revision_texto}</span> : null}
                      </div>
                    );
                  if (r === "pendiente") return <span className="w-fit rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/55">Entregado · por revisar</span>;
                  return null;
                })()}

                {abierta?.tipo === "nota" ? (
                  <div className="space-y-1.5">
                    <textarea
                      autoFocus
                      value={abierta.texto}
                      onChange={(e) => setPanel({ ...abierta, texto: e.target.value })}
                      rows={3}
                      maxLength={2000}
                      placeholder="Nota interna (solo la veis tu socio y tú, la modelo no)"
                      className="input-base w-full resize-y text-xs"
                    />
                    <div className="flex gap-1.5">
                      <button disabled={ocupadoAqui} onClick={() => guardarNota(c, abierta.texto)} className="rounded-lg bg-[#8B5CF6] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">Guardar nota</button>
                      <button onClick={() => setPanel(null)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/60 hover:text-white">Cancelar</button>
                    </div>
                  </div>
                ) : c.nota ? (
                  <button onClick={() => setPanel({ id: c.id, tipo: "nota", texto: c.nota ?? "" })} className="whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1.5 text-left text-xs text-amber-100/80 hover:bg-amber-500/[0.12]">
                    📝 {c.nota}
                  </button>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-2.5 text-[11px]">
                  <button
                    disabled={ocupadoAqui || c.archivos === 0}
                    onClick={() => marcarSubido(c, !todoSubido)}
                    title={todoSubido ? "Quitar la marca de subido" : "Marcar todo como subido a OnlyFans"}
                    className={`rounded-lg border px-2 py-1 font-semibold transition disabled:opacity-40 ${todoSubido ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"}`}
                  >
                    {todoSubido ? "✓ Subido (deshacer)" : "Marcar subido"}
                  </button>
                  <button onClick={() => setPanel({ id: c.id, tipo: "renombrar", texto: c.nombre })} className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 font-semibold text-white/60 transition hover:text-white">Renombrar</button>
                  <button onClick={() => setPanel({ id: c.id, tipo: "nota", texto: c.nota ?? "" })} className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 font-semibold text-white/60 transition hover:text-white">{c.nota ? "Editar nota" : "Nota"}</button>
                  <button disabled={ocupadoAqui} onClick={() => borrar(c)} className="ml-auto rounded-lg border border-red-900/50 bg-red-950/40 px-2 py-1 font-semibold text-red-300 transition hover:bg-red-950/70 disabled:opacity-40">Borrar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {aviso ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{aviso}</p> : null}
    </div>
  );
}

/** Foto de perfil y banner que ha subido cada modelo desde su portal: las que ya las tienen primero, las pendientes al final. */
function PerfilYBanner({
  modelos,
  fotos,
  onCambio,
}: {
  modelos: Array<{ id: string; nombre: string; foto: number | null }>;
  fotos: Record<string, FotosPerfilVistas>;
  onCambio: (id: string, f: FotosPerfilVistas) => void;
}) {
  const vacias: FotosPerfilVistas = { perfil: null, banner: null, perfilOpciones: [], bannerOpciones: [], pedir: { perfil: null, banner: null } };
  const de = (id: string) => fotos[id] ?? vacias;
  const n = (id: string) => Number(Boolean(de(id).perfil)) + Number(Boolean(de(id).banner));
  const ordenadas = [...modelos].sort((a, b) => n(b.id) - n(a.id) || a.nombre.localeCompare(b.nombre, "es"));
  if (!ordenadas.length) return <div className="grid min-h-[20vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-white/35">No hay modelos.</div>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ordenadas.map((m) => (
        <div key={m.id} className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center gap-2">
            <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-7 w-7 text-[11px]" />
            <p className="min-w-0 flex-1 truncate font-semibold text-white">{m.nombre}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${n(m.id) === 2 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : n(m.id) === 1 ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-white/10 text-white/40"}`}>
              {n(m.id) === 2 ? "Completas" : n(m.id) === 1 ? "Falta 1" : "Sin subir"}
            </span>
          </div>
          <FotosPerfilModelo modeloId={m.id} fotos={de(m.id)} onCambio={(f) => onCambio(m.id, f)} />
        </div>
      ))}
    </div>
  );
}
