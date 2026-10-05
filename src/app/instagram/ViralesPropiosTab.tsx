"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { AvatarModelo } from "@/components/AvatarModelo";
import { formatDate } from "@/lib/utils";
import { compacto, pct } from "@/lib/viral";
import { ExtensionBoton } from "./ExtensionBoton";

export type ViralPropio = {
  id: string;
  cuenta_id: string;
  modelo_id: string | null;
  codigo: string;
  video_key: string | null;
  thumbnail_url: string | null;
  descripcion: string | null;
  vistas: number;
  likes: number;
  comentarios: number;
  compartidos: number;
  viral_score: number | null;
  mediana_cuenta: number | null;
  fecha_publicacion: string | null;
  estado: "pendiente" | "aprobado" | "subido" | "descartado";
  username: string;
  modelo_nombre: string;
  foto: number | null;
};

type Vista = ViralPropio["estado"];

const ETIQUETA: Record<Vista, string> = {
  pendiente: "Por revisar",
  aprobado: "Aprobados",
  subido: "Subidos a trial",
  descartado: "Descartados",
};

function urlVideo(key: string | null) {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return key && base ? `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}` : null;
}

export function ViralesPropiosTab({ virales: iniciales }: { virales: ViralPropio[] }) {
  const [virales, setVirales] = useState(iniciales);
  useEffect(() => setVirales(iniciales), [iniciales]);
  const [vista, setVista] = useState<Vista>("pendiente");
  const [cuenta, setCuenta] = useState("todas");
  const [dias, setDias] = useState(0);
  const [orden, setOrden] = useState<"score" | "vistas" | "compartidos" | "reciente">("score");
  const [error, setError] = useState<string | null>(null);

  const cuentas = useMemo(() => Array.from(new Set(virales.map((v) => v.username))).sort(), [virales]);
  const conteo = (x: Vista) => virales.filter((v) => v.estado === x).length;

  const visibles = useMemo(() => {
    const limite = dias ? Date.now() - dias * 86400000 : 0;
    return virales
      .filter((v) => v.estado === vista)
      .filter((v) => cuenta === "todas" || v.username === cuenta)
      .filter((v) => !limite || (v.fecha_publicacion && new Date(v.fecha_publicacion).getTime() >= limite))
      .sort((a, b) => {
        if (orden === "reciente") return new Date(b.fecha_publicacion ?? 0).getTime() - new Date(a.fecha_publicacion ?? 0).getTime();
        if (orden === "vistas") return b.vistas - a.vistas;
        if (orden === "compartidos") return (b.vistas ? b.compartidos / b.vistas : 0) - (a.vistas ? a.compartidos / a.vistas : 0);
        return (b.viral_score ?? 0) - (a.viral_score ?? 0);
      });
  }, [virales, vista, cuenta, dias, orden]);

  async function cambiar(v: ViralPropio, estado: Vista) {
    setError(null);
    const anterior = v.estado;
    setVirales((prev) => prev.map((x) => (x.id === v.id ? { ...x, estado } : x)));
    const res = await fetch(`/api/virales-propios/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    if (!res.ok) {
      setVirales((prev) => prev.map((x) => (x.id === v.id ? { ...x, estado: anterior } : x)));
      setError("No se pudo guardar el cambio");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="mb-2 text-sm text-white/60">
          Los reels más virales de las cuentas de tus modelos (últimas semanas). Apruébalos, descárgalos y súbelos como trial reels.
        </p>
        <ExtensionBoton modo="propias" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["pendiente", "aprobado", "subido", "descartado"] as const).map((x) => (
          <button
            key={x}
            onClick={() => setVista(x)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${vista === x ? "bg-[#8B5CF6] text-white" : "bg-white/[0.05] text-white/50 hover:text-white/80"}`}
          >
            {ETIQUETA[x]} ({conteo(x)})
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="input-base py-1.5 text-xs">
            <option value={0}>Todo el tiempo</option>
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="input-base py-1.5 text-xs">
            <option value="todas">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c} value={c}>@{c}</option>
            ))}
          </select>
          <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} className="input-base py-1.5 text-xs">
            <option value="score">Mejor score</option>
            <option value="vistas">Más vistas</option>
            <option value="compartidos">Más compartidos (tasa)</option>
            <option value="reciente">Más recientes</option>
          </select>
        </div>
      </div>
      {error ? <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}

      {visibles.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-center text-sm text-white/35">
          {vista === "pendiente" ? "No hay virales por revisar. Pulsa «Buscar virales de mis modelos» (con la extensión instalada)." : "Nada por aquí todavía."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((v) => {
            const src = urlVideo(v.video_key);
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
                  <span className="flex items-center gap-1.5 font-semibold text-white/80">
                    <AvatarModelo id={v.modelo_id} nombre={v.modelo_nombre || v.username} foto={v.foto} className="h-5 w-5 text-[9px]" />
                    @{v.username}
                  </span>
                  <span className="text-white/35">{v.fecha_publicacion ? formatDate(v.fecha_publicacion) : "—"}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-center">
                  <Metrica label="Visitas" valor={compacto(v.vistas)} sub={v.mediana_cuenta ? `${(v.vistas / v.mediana_cuenta).toFixed(1).replace(".", ",")}× su mediana` : undefined} />
                  <Metrica label="Score" valor={v.viral_score ? v.viral_score.toFixed(1).replace(".", ",") : "n/d"} />
                  <Metrica label="Likes" valor={compacto(v.likes)} sub={v.vistas ? pct((v.likes / v.vistas) * 100) : undefined} />
                  <Metrica label="Comentarios" valor={compacto(v.comentarios)} sub={v.vistas ? pct((v.comentarios / v.vistas) * 100) : undefined} />
                  <div className="col-span-2">
                    <Metrica label="Compartidos" valor={compacto(v.compartidos)} sub={v.vistas ? `${pct((v.compartidos / v.vistas) * 100)} de las visitas` : undefined} />
                  </div>
                </div>
                {v.descripcion ? <p className="line-clamp-2 text-xs text-white/45">{v.descripcion}</p> : null}

                <div className="mt-auto flex flex-wrap gap-2">
                  {v.estado === "pendiente" ? (
                    <>
                      <button onClick={() => cambiar(v, "aprobado")} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                        ✓ Aprobar
                      </button>
                      <button onClick={() => cambiar(v, "descartado")} className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-950/50">
                        Descartar
                      </button>
                    </>
                  ) : null}
                  {v.estado === "aprobado" ? (
                    <>
                      <a href={`/api/virales-propios/${v.id}/descargar`} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                        <Download className="h-4 w-4" /> Descargar
                      </a>
                      <button onClick={() => cambiar(v, "subido")} className="flex-1 rounded-lg bg-[#8B5CF6] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]">
                        Marcar subido a trial
                      </button>
                    </>
                  ) : null}
                  {v.estado === "subido" ? (
                    <a href={`/api/virales-propios/${v.id}/descargar`} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white/70 transition hover:text-white">
                      <Download className="h-4 w-4" /> Descargar
                    </a>
                  ) : null}
                  {v.estado !== "pendiente" ? (
                    <button onClick={() => cambiar(v, "pendiente")} className="ml-auto text-xs text-white/40 hover:text-white">
                      Devolver a revisar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
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
