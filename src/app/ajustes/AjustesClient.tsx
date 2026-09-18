"use client";

import { useEffect, useState } from "react";

type Estado = {
  configurado: boolean;
  conectado: boolean;
  cuentas: string[];
  error?: string;
  zona: string;
  slots: { hora: string; trial: boolean }[];
};

export function AjustesClient() {
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    fetch("/api/publer/estado")
      .then((r) => r.json())
      .then((j) => setEstado(j as Estado))
      .catch(() => setEstado(null));
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Publer</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              estado?.conectado ? "bg-green-900/40 text-green-400" : "bg-zinc-800 text-halo-subtle"
            }`}
          >
            {estado === null ? "Comprobando..." : estado.conectado ? "✓ Conectado" : estado.configurado ? "Error de conexión" : "Sin activar"}
          </span>
        </div>
        <p className="text-xs text-halo-subtle">
          Al aprobar un vídeo, el agente lo programa solo en Publer en el siguiente hueco libre de las cuentas de Instagram de la modelo. Mientras
          Publer no esté activo, los aprobados se quedan en <b>Aprobación → Aprobados</b> para que los descargues y los subas tú, y se programarán
          solos cuando lo actives.
        </p>
        {estado?.error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{estado.error}</p> : null}
        {estado?.conectado ? (
          <p className="text-xs text-halo-subtle">
            Cuentas de Instagram en Publer: <span className="text-halo-text">{estado.cuentas.length ? estado.cuentas.join(", ") : "ninguna"}</span>. El nombre de la cuenta en
            Publer debe coincidir con el usuario de Instagram registrado en el panel.
          </p>
        ) : (
          <div className="space-y-1 rounded-lg border border-halo-border/60 bg-halo-bg/50 p-2.5 text-[11px] text-halo-subtle">
            <p>Para activarlo añade estas variables en Vercel (Settings → Environment Variables) y vuelve a desplegar:</p>
            <p className="font-mono text-halo-text">PUBLER_API_KEY = (Publer → Settings → API)</p>
            <p className="font-mono text-halo-text">PUBLER_WORKSPACE_ID = (id de tu workspace)</p>
            <p className="font-mono text-halo-text">CRON_SECRET = (una clave larga cualquiera; la misma en el .env del runner)</p>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Ritmo de publicación</h2>
        <p className="text-xs text-halo-subtle">
          Por cada cuenta de Instagram y día (hora de España). Los reels son los vídeos que apruebas; los trial reels los genera solo el runner con
          los vídeos virales de la propia cuenta (spoofer, máximo 5 usos por vídeo).
        </p>
        <ul className="space-y-1.5 text-sm">
          {(estado?.slots ?? []).map((s) => (
            <li key={s.hora} className="flex items-center justify-between rounded-lg border border-halo-border/60 bg-halo-bg/40 px-3 py-2">
              <span className="font-mono text-halo-text">{s.hora}</span>
              <span className={`badge ${s.trial ? "badge-editando" : "badge-aprobado"}`}>{s.trial ? "Trial reel" : "Reel en la cuadrícula"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
