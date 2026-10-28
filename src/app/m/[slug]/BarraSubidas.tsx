"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { limpiar, obtener, obtenerServidor, reintentar, reintentarFallidos, suscribir } from "./subidaVideos";

const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace(".", ",")} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const tiempo = (s: number) => (s < 60 ? "menos de 1 min" : `${Math.round(s / 60)} min`);

/** Barra fija con el avance de TODAS las subidas del portal: se ve en cualquier pestaña, dice cuanto falta y deja reintentar lo que fallo. */
export function BarraSubidas() {
  const router = useRouter();
  const estado = useSyncExternalStore(suscribir, obtener, obtenerServidor);
  const [abierta, setAbierta] = useState(false);
  const activos = estado.items.filter((i) => i.estado === "cola" || i.estado === "subiendo");
  const fallidos = estado.items.filter((i) => i.estado === "error");
  const buenos = estado.items.filter((i) => i.estado === "ok" || i.estado === "repetido");
  const trabajando = activos.length > 0;

  // Al terminar todo: se recarga la pagina UNA vez (para que los contadores reflejen lo guardado) y, si no hubo fallos, la barra se va sola
  const estabaTrabajando = useRef(false);
  useEffect(() => {
    if (estabaTrabajando.current && !trabajando) {
      router.refresh();
      if (!fallidos.length) {
        const t = window.setTimeout(() => limpiar(), 7000);
        estabaTrabajando.current = trabajando;
        return () => window.clearTimeout(t);
      }
    }
    estabaTrabajando.current = trabajando;
  }, [trabajando, fallidos.length, router]);

  if (!estado.items.length) return null;

  const total = estado.items.reduce((s, i) => s + i.size, 0) || 1;
  const hecho = estado.items.reduce((s, i) => s + i.subido, 0);
  const pct = Math.min(100, Math.round((hecho / total) * 100));
  const quedan = estado.velocidad > 50_000 ? (total - hecho) / estado.velocidad : null;
  const repetidos = estado.items.filter((i) => i.estado === "repetido").length;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-[#14101f]/95 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur">
        {trabajando ? (
          <div className="p-3">
            <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="text-sm font-semibold text-white">
                ⬆️ Subiendo {buenos.length + 1} de {estado.items.length} · {pct}%
              </span>
              <span className="text-xs text-white/50">
                {estado.velocidad > 50_000 ? `${(estado.velocidad / 1e6).toFixed(1).replace(".", ",")} MB/s` : "calculando…"}
                {quedan !== null ? ` · quedan ${tiempo(quedan)}` : ""}
              </span>
            </button>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#8B5CF6] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-white/40">Puedes moverte por el portal mientras sube, pero no cierres la página ni apagues la pantalla. Con wifi va mucho más rápido.</p>
            {abierta ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-white/60">
                {estado.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{i.nombre}</span>
                    <span className="shrink-0">{i.estado === "ok" || i.estado === "repetido" ? "✓" : i.estado === "error" ? "⚠️" : i.estado === "cola" ? "en cola" : `${Math.round((i.subido / i.size) * 100)}%`}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {buenos.length ? (
              <p className="text-sm font-semibold text-emerald-300">
                ✅ {buenos.length === 1 ? "Vídeo subido" : `${buenos.length} vídeos subidos`}
                {repetidos ? <span className="font-normal text-emerald-200/70"> ({repetidos} ya estaban subidos)</span> : null}
              </p>
            ) : null}
            {fallidos.length ? (
              <div className="space-y-1.5 rounded-xl bg-red-500/10 p-2.5">
                <p className="text-sm font-semibold text-red-200">
                  ⚠️ No se {fallidos.length === 1 ? "ha podido subir 1 vídeo" : `han podido subir ${fallidos.length} vídeos`}
                </p>
                <ul className="space-y-1 text-xs text-red-100/80">
                  {fallidos.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate">{f.nombre} · {mb(f.size)}</span>
                        <span className="block text-red-100/60">{f.motivo}</span>
                      </span>
                      <button type="button" onClick={() => reintentar(f.id)} className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 font-semibold text-white hover:bg-white/20">
                        Reintentar
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-red-100/60">Lo que ya se subió está guardado. Los fallidos continúan por donde iban.</p>
                {fallidos.length > 1 ? (
                  <button type="button" onClick={reintentarFallidos} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                    Reintentar todos
                  </button>
                ) : null}
              </div>
            ) : null}
            <button type="button" onClick={() => limpiar(true)} className="text-xs font-semibold text-white/50 hover:text-white">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
