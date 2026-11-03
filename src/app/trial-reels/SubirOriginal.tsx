"use client";

import { useRef, useState } from "react";

export type CuentaSubida = { id: string; username: string; modelo: string };
type Estado = { nombre: string; size: number; hecho: number; fase: "espera" | "subiendo" | "listo" | "error"; error?: string };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (n: number) => `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(".", ",")} MB`;

async function json<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(res.status === 401 ? "Tu sesión ha caducado: recarga la página y vuelve a entrar." : ((j as { error?: string }).error ?? `Error ${res.status}`));
  return j;
}

/**
 * Subir tu propio vídeo original para crear trial reels sin depender de un viral guardado. El vídeo viaja en trozos de 4 MB por el propio panel
 * (a R2 no se llega desde todas las redes); el editor del servidor los une, guarda el original y, si lo pides, genera los trial reels.
 */
export function SubirOriginal({ cuentas, cantidadInicial, onListo }: { cuentas: CuentaSubida[]; cantidadInicial: number; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(cantidadInicial);
  const [generar, setGenerar] = useState(true);
  const [descripcion, setDescripcion] = useState("");
  const [cola, setCola] = useState<Estado[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function marcar(i: number, cambios: Partial<Estado>) {
    setCola((p) => p.map((x, j) => (j === i ? { ...x, ...cambios } : x)));
  }

  async function subirUno(archivo: File, i: number) {
    marcar(i, { fase: "subiendo", hecho: 0, error: undefined });
    try {
      const ini = await json<{ codigo: string; trozo: number }>(
        await fetch("/api/trial-reels/subir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "iniciar", cuenta_id: cuenta, nombre: archivo.name, size: archivo.size, tipo: archivo.type }) }),
      );
      const partes = Math.ceil(archivo.size / ini.trozo);
      const hechos = new Set<number>();
      let siguiente = 1;
      const hechoBytes = () => Math.min(archivo.size, [...hechos].reduce((s, n) => s + Math.min(ini.trozo, archivo.size - (n - 1) * ini.trozo), 0));
      await Promise.all(
        Array.from({ length: Math.min(3, partes) }, async () => {
          while (siguiente <= partes) {
            const n = siguiente++;
            const trozo = archivo.slice((n - 1) * ini.trozo, Math.min(n * ini.trozo, archivo.size));
            for (let intento = 1; ; intento++) {
              try {
                await json(await fetch(`/api/trial-reels/subir/parte?cuenta=${cuenta}&codigo=${ini.codigo}&n=${n}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: trozo }));
                break;
              } catch (e) {
                if (intento >= 6 || (e instanceof Error && /sesión ha caducado/.test(e.message))) throw e;
                await esperar(Math.min(10000, 800 * 2 ** intento));
              }
            }
            hechos.add(n);
            marcar(i, { hecho: hechoBytes() });
          }
        }),
      );
      await json(
        await fetch("/api/trial-reels/subir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "terminar", cuenta_id: cuenta, codigo: ini.codigo, partes, size: archivo.size, nombre: archivo.name, tipo: archivo.type, descripcion, cantidad, generar }),
        }),
      );
      marcar(i, { fase: "listo", hecho: archivo.size });
      return true;
    } catch (e) {
      marcar(i, { fase: "error", error: e instanceof Error ? e.message : "No se pudo subir" });
      return false;
    }
  }

  async function empezar(archivos: File[]) {
    if (!archivos.length || !cuenta || trabajando) return;
    setCola(archivos.map((f) => ({ nombre: f.name, size: f.size, hecho: 0, fase: "espera" })));
    setTrabajando(true);
    let alguno = false;
    for (let i = 0; i < archivos.length; i++) alguno = (await subirUno(archivos[i], i)) || alguno;
    setTrabajando(false);
    if (input.current) input.current.value = "";
    if (alguno) onListo();
  }

  if (!cuentas.length) return null;
  const hechos = cola.filter((x) => x.fase === "listo").length;
  return (
    <div className="rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.06] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setAbierto((v) => !v)} className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 font-semibold text-white transition hover:bg-[#7C3AED]">
          ⬆ Subir mi propio vídeo original
        </button>
        <span className="text-white/45">Para crear trial reels de un vídeo tuyo, sin depender de uno guardado que luego desaparezca.</span>
      </div>
      {abierto ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-semibold text-white/70">Cuenta de Instagram</span>
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} disabled={trabajando} className="input-base w-full py-1.5 text-xs">
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    @{c.username}
                    {c.modelo ? ` · ${c.modelo}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-white/70">Nota (opcional)</span>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={trabajando} maxLength={300} placeholder="Para recordar de qué va este vídeo" className="input-base w-full py-1.5 text-xs" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-white/70">Versiones</span>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" disabled={trabajando} onClick={() => setCantidad(n)} className={`h-7 w-7 rounded-lg text-xs font-bold transition ${cantidad === n ? "bg-[#8B5CF6] text-white" : "bg-white/[0.06] text-white/50 hover:text-white"}`}>
                {n}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-white/60">
              <input type="checkbox" checked={generar} disabled={trabajando} onChange={(e) => setGenerar(e.target.checked)} className="accent-[#8B5CF6]" /> Crear los trial reels al terminar
            </label>
          </div>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 font-semibold text-white/80 transition hover:text-white ${trabajando ? "pointer-events-none opacity-50" : ""}`}>
            Elegir vídeo(s) del ordenador
            <input ref={input} type="file" accept="video/*,.mov,.mp4,.m4v,.webm,.mkv" multiple className="sr-only" onChange={(e) => void empezar(Array.from(e.target.files ?? []))} />
          </label>
          {cola.length ? (
            <ul className="space-y-1.5">
              {cola.map((x, i) => (
                <li key={`${x.nombre}-${i}`} className="rounded-lg bg-black/25 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-white/80">{x.nombre}</span>
                    <span className={`shrink-0 font-semibold ${x.fase === "error" ? "text-red-300" : x.fase === "listo" ? "text-emerald-300" : "text-white/50"}`}>
                      {x.fase === "listo" ? "✓ Subido" : x.fase === "error" ? "Error" : x.fase === "espera" ? "En espera" : `${Math.round((x.hecho / x.size) * 100)}% · ${mb(x.size)}`}
                    </span>
                  </div>
                  {x.fase === "subiendo" ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-[#8B5CF6] transition-all" style={{ width: `${Math.round((x.hecho / x.size) * 100)}%` }} />
                    </div>
                  ) : null}
                  {x.error ? <p className="mt-1 text-red-300">{x.error}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {!trabajando && hechos > 0 ? (
            <p className="text-emerald-300">
              {hechos === 1 ? "Subido." : `${hechos} subidos.`} El servidor lo está preparando: en un minuto aparece abajo como un vídeo tuyo{generar ? " y empieza a generar sus trial reels" : ""}.
            </p>
          ) : null}
          <p className="text-white/35">Hasta 1,5 GB por vídeo. Puedes cerrar esta ventana mientras se prepara, pero no la página mientras se sube.</p>
        </div>
      ) : null}
    </div>
  );
}
