"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VisorFotos } from "@/components/VisorFotos";
import type { Historia } from "@/lib/historiasIG";

type Estado = { nombre: string; fase: "subiendo" | "ok" | "error"; error?: string };

async function leer<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? (res.status === 401 ? "Tu sesión ha caducado, vuelve a entrar" : `Error ${res.status}`));
  return j;
}

/** Pestaña "Historias IG": la modelo sube las fotos de las historias de Instagram y ve las que ya ha subido. */
export function HistoriasIG() {
  const [historias, setHistorias] = useState<Historia[] | null>(null); // null = cargando
  const [cola, setCola] = useState<Estado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [visor, setVisor] = useState<number | null>(null);
  const subiendo = cola.some((c) => c.fase === "subiendo");

  const recargar = useCallback(async () => {
    const j = await leer<{ historias: Historia[] }>(await fetch("/api/portal/historias", { cache: "no-store" }));
    setHistorias(j.historias);
  }, []);

  // Los enlaces de las vistas previas caducan a la hora: al abrir la pestaña se refrescan
  useEffect(() => {
    void recargar().catch(() => undefined);
  }, [recargar]);

  async function subirUna(file: File, idx: number) {
    const marcar = (cambios: Partial<Estado>) => setCola((p) => p.map((c, i) => (i === idx ? { ...c, ...cambios } : c)));
    try {
      const contentType = file.type || (/\.(heic|heif)$/i.test(file.name) ? "image/heic" : "image/jpeg");
      const pre = await leer<{ key: string; modo: string; url: string; contentType: string }>(
        await fetch("/api/portal/historias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "presign", filename: file.name, contentType, size: file.size }),
        }),
      );
      const put = await fetch(pre.url, { method: "PUT", headers: { "Content-Type": pre.contentType }, body: file });
      if (!put.ok) throw new Error(`No se pudo subir (${put.status}). Prueba otra vez.`);
      await leer(
        await fetch("/api/portal/historias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "confirmar", key: pre.key, size: file.size }),
        }),
      );
      marcar({ fase: "ok" });
    } catch (e) {
      marcar({ fase: "error", error: e instanceof Error ? e.message : "Error" });
    }
  }

  async function elegir(lista: FileList | null) {
    if (!lista?.length) return;
    const archivos = Array.from(lista);
    setError(null);
    setCola(archivos.map((f) => ({ nombre: f.name, fase: "subiendo" })));
    let siguiente = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, archivos.length) }, async () => {
        while (siguiente < archivos.length) {
          const i = siguiente++;
          await subirUna(archivos[i], i);
        }
      }),
    );
    await recargar().catch(() => undefined);
  }

  async function borrar(h: Historia) {
    if (!confirm("¿Borrar esta foto?")) return;
    setError(null);
    try {
      await leer(await fetch(`/api/portal/historias?key=${encodeURIComponent(h.key)}`, { method: "DELETE" }));
      setHistorias((p) => (p ?? []).filter((x) => x.key !== h.key));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  const hechas = cola.filter((c) => c.fase === "ok").length;
  const fallidas = cola.filter((c) => c.fase === "error");

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="font-display text-lg font-semibold text-white">📸 Historias de Instagram</p>
        <p className="mt-1 text-sm leading-relaxed text-white/60">
          Aquí subes las <b className="text-white/85">fotos para las historias de Instagram</b> (no son de OnlyFans). Puedes elegir varias a la vez: se suben tal cual, sin perder calidad, y el equipo las publica.
        </p>
        <button type="button" onClick={() => input.current?.click()} disabled={subiendo} className="btn-primary mt-3 min-h-11 w-full px-5 text-sm disabled:opacity-50">
          {subiendo ? `Subiendo ${hechas + fallidas.length}/${cola.length}…` : "＋ Subir fotos de historias"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(e) => {
            void elegir(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        {cola.length && !subiendo ? (
          <p className={`mt-3 text-sm ${fallidas.length ? "text-amber-300" : "text-emerald-300"}`}>
            {hechas ? `✓ ${hechas} ${hechas === 1 ? "foto subida" : "fotos subidas"}.` : ""}{" "}
            {fallidas.length ? `${fallidas.length} no se ${fallidas.length === 1 ? "pudo" : "pudieron"} subir: ${[...new Set(fallidas.map((f) => f.error))].join("; ")}` : ""}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      {historias === null ? (
        <p className="text-center text-sm text-white/40">Cargando tus fotos…</p>
      ) : historias.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Subidas ({historias.length})</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {historias.map((h) => (
              <div key={h.key} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                <button type="button" onClick={() => setVisor(historias.indexOf(h))} aria-label="Ver la foto grande" className="block h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={h.vista}
                    alt="Foto de historia"
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.opacity = "0.15";
                    }}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => borrar(h)}
                  aria-label="Borrar esta foto"
                  className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-xs text-white/80 hover:bg-red-600 hover:text-white"
                >
                  ✕
                </button>
                {h.fecha ? (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white/70">
                    {new Date(h.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/40">Todavía no has subido ninguna foto de historias.</p>
      )}
      {visor !== null && historias?.length ? (
        <VisorFotos
          fotos={historias.map((h) => ({ src: h.vista, pie: h.fecha ? new Date(h.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : undefined }))}
          indice={Math.min(visor, historias.length - 1)}
          onCambiar={setVisor}
          onCerrar={() => setVisor(null)}
        />
      ) : null}
    </section>
  );
}
