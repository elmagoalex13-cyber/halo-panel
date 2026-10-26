"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AvisoPostsProgramados } from "@/lib/postsAvisos";

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }) : "");

/** Aviso del dashboard: todos los posts aprobados de una modelo ya estan programados en Venuz. */
export function AvisoPostsProgramadosCard({ avisos }: { avisos: AvisoPostsProgramados[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  if (!avisos.length) return null;

  async function visto() {
    setOcupado(true);
    try {
      await fetch("/api/avisos/posts-vistos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: avisos.map((a) => a.id) }) });
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/[0.08] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-violet-100">📅 {avisos.length === 1 ? "Todos los posts programados" : `Todos los posts programados en ${avisos.length} modelos`}</p>
          <p className="mt-0.5 text-sm text-violet-100/60">No queda ningún post aprobado esperando: todos están ya en la cola de Venuz.</p>
        </div>
        <button type="button" onClick={visto} disabled={ocupado} className="shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:text-white disabled:opacity-50">
          {ocupado ? "…" : "Entendido"}
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {avisos.map((a) => (
          <li key={a.id}>
            <Link href="/posts-of" className="block rounded-xl border border-violet-300/30 bg-violet-300/10 px-3 py-2 text-sm text-violet-50 transition hover:bg-violet-300/20">
              <span className="font-semibold">{a.nombre}</span> · {a.n} {a.n === 1 ? "post" : "posts"}
              {a.hasta ? <span className="text-violet-100/60"> · hasta el {fecha(a.hasta)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
