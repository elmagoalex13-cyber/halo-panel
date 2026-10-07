"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { UsuariosPanel } from "./UsuariosPanel";

type Estado = {
  configurado: boolean;
  conectado: boolean;
  cuentas: string[];
  error?: string;
  zona: string;
  slots: { hora: string; trial: boolean }[];
};

export function AjustesClient({ esDueno = false }: { esDueno?: boolean }) {
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    fetch("/api/publer/estado")
      .then((r) => r.json())
      .then((j) => setEstado(j as Estado))
      .catch(() => setEstado(null));
  }, []);

  const estadoChip = estado === null
    ? { texto: "Comprobando…", clase: "border-white/10 text-white/45" }
    : estado.conectado
      ? { texto: "✓ Conectado", clase: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" }
      : estado.configurado
        ? { texto: "Error de conexión", clase: "border-red-400/30 bg-red-400/10 text-red-300" }
        : { texto: "Sin activar", clase: "border-amber-400/30 bg-amber-400/10 text-amber-300" };

  return (
    <div className="max-w-3xl space-y-6">
      <GlassCard className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">Publer</h2>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${estadoChip.clase}`}>{estadoChip.texto}</span>
        </div>
        <p className="text-sm leading-relaxed text-white/55">
          Al aprobar un vídeo, el agente lo programa solo en Publer en el siguiente hueco libre de las cuentas de Instagram de la modelo. Mientras
          Publer no esté activo, los aprobados se quedan en <span className="font-semibold text-white/80">Aprobación → Aprobados</span> para que los descargues y los subas tú, y se programarán
          solos cuando lo actives.
        </p>
        {estado?.error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{estado.error}</p> : null}
        {estado?.conectado ? (
          <p className="text-sm text-white/55">
            Cuentas de Instagram en Publer: <span className="font-semibold text-white">{estado.cuentas.length ? estado.cuentas.join(", ") : "ninguna"}</span>. El nombre de la cuenta en
            Publer debe coincidir con el usuario de Instagram registrado en el panel.
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/25 p-4 text-sm text-white/55">
            <p>Para activarlo añade estas variables en Vercel (Settings → Environment Variables) y vuelve a desplegar:</p>
            <p className="font-mono text-[13px] text-violet-200">PUBLER_API_KEY <span className="text-white/35">= (Publer → Settings → API)</span></p>
            <p className="font-mono text-[13px] text-violet-200">PUBLER_WORKSPACE_ID <span className="text-white/35">= (id de tu workspace)</span></p>
            <p className="font-mono text-[13px] text-violet-200">CRON_SECRET <span className="text-white/35">= (una clave larga cualquiera; la misma en el .env del runner)</span></p>
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-4 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Ritmo de publicación</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/55">
            Por cada cuenta de Instagram y día (hora de España). Los reels son los vídeos que apruebas; los trial reels los genera solo el runner con
            los vídeos virales de la propia cuenta (spoofer, máximo 5 usos por vídeo).
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(estado?.slots ?? []).map((s) => (
            <li key={`${s.hora}-${s.trial}`} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <span className="font-mono text-base font-semibold text-white">{s.hora}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${s.trial ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-violet-400/40 bg-violet-500/15 text-violet-200"}`}>
                {s.trial ? "Trial reel" : "Reel en la cuadrícula"}
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>
      {esDueno ? <UsuariosPanel /> : null}
    </div>
  );
}
