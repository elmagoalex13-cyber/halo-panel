"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarModelo } from "@/components/AvatarModelo";
import { GlassCard } from "@/components/GlassCard";

export type VenuzCuenta = {
  id: string;
  nombre: string;
  username: string | null;
  avatar_url: string | null;
  modelo_id: string | null;
  activa: boolean;
  estado_conexion: string | null;
  suscriptores: number | null;
  ambito?: "privado" | "compartido"; // heredado de su modelo
};

export type VenuzDia = {
  cuenta_id: string;
  fecha: string;
  suscripciones: number; mensajes: number; tips: number; posts: number; referidos: number; streams: number; total: number;
  suscripciones_bruto: number; mensajes_bruto: number; tips_bruto: number; posts_bruto: number; referidos_bruto: number; streams_bruto: number; total_bruto: number;
};

export type VenuzMes = {
  cuenta_id: string;
  mes: string;
  total_neto: number;
  total_bruto: number;
  reembolsos: number;
  fans_activos: number | null;
  fans_nuevos: number | null;
  renovaciones: number | null;
  ventas: number | null;
  gasto_medio_fan: number | null;
};

export type ModeloLite = { id: string; nombre: string; foto: number | null };

type Periodo = "hoy" | "ayer" | "mes" | "7d" | "30d" | "mesant" | "todo";
type Canal = "suscripciones" | "mensajes" | "tips" | "posts" | "referidos" | "streams";

const CANALES: { key: Canal; label: string; color: string }[] = [
  { key: "mensajes", label: "Mensajes (PPV)", color: "bg-fuchsia-400" },
  { key: "suscripciones", label: "Suscripciones", color: "bg-sky-400" },
  { key: "tips", label: "Tips", color: "bg-amber-400" },
  { key: "posts", label: "Posts", color: "bg-emerald-400" },
  { key: "referidos", label: "Referidos", color: "bg-violet-400" },
  { key: "streams", label: "Streams", color: "bg-rose-400" },
];

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "mes", label: "Este mes" },
  { id: "mesant", label: "Mes anterior" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "todo", label: "Todo" },
];

const usd = (v: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const dia = (d: Date) => d.toISOString().slice(0, 10);

function rango(periodo: Periodo): [string, string] {
  const hoy = new Date();
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  if (periodo === "hoy") return [dia(hoy), dia(hoy)];
  if (periodo === "ayer") return [dia(new Date(hoy.getTime() - 86400000)), dia(new Date(hoy.getTime() - 86400000))];
  if (periodo === "mes") return [dia(new Date(Date.UTC(y, m, 1))), dia(hoy)];
  if (periodo === "mesant") return [dia(new Date(Date.UTC(y, m - 1, 1))), dia(new Date(Date.UTC(y, m, 0)))];
  if (periodo === "7d") return [dia(new Date(hoy.getTime() - 6 * 86400000)), dia(hoy)];
  if (periodo === "30d") return [dia(new Date(hoy.getTime() - 29 * 86400000)), dia(hoy)];
  return ["0000-01-01", "9999-12-31"];
}

function etiquetaMes(mes: string) {
  return new Date(`${mes}T00:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function VenuzResumen({
  cuentas: cuentasTodas,
  diarios: diariosTodos,
  meses: mesesTodos,
  modelos,
  ultimaSync,
  esDueno = false,
}: {
  esDueno?: boolean;
  cuentas: VenuzCuenta[];
  diarios: VenuzDia[];
  meses: VenuzMes[];
  modelos: ModeloLite[];
  ultimaSync: { created_at: string; resultado: string; detalle: { problemas?: string[]; error?: string } | null } | null;
}) {
  const router = useRouter();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  // Mis modelos / compartidas con mi socio: separa la facturacion de cada grupo
  const [grupo, setGrupo] = useState<"todas" | "mias" | "compartidas">("todas");
  const cuentas = useMemo(
    () => cuentasTodas.filter((c) => grupo === "todas" || (grupo === "compartidas" ? c.ambito === "compartido" : c.ambito !== "compartido")),
    [cuentasTodas, grupo],
  );
  const idsGrupo = useMemo(() => new Set(cuentas.map((c) => c.id)), [cuentas]);
  const diarios = useMemo(() => (grupo === "todas" ? diariosTodos : diariosTodos.filter((d) => idsGrupo.has(d.cuenta_id))), [diariosTodos, idsGrupo, grupo]);
  const meses = useMemo(() => (grupo === "todas" ? mesesTodos : mesesTodos.filter((m) => idsGrupo.has(m.cuenta_id))), [mesesTodos, idsGrupo, grupo]);
  const [cuentaSel, setCuentaSel] = useState<string>("todas");
  const [bruto, setBruto] = useState(false);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);

  const modeloPorId = useMemo(() => new Map(modelos.map((m) => [m.id, m])), [modelos]);
  const [desde, hasta] = useMemo(() => rango(periodo), [periodo]);

  const filas = useMemo(
    () => diarios.filter((d) => d.fecha >= desde && d.fecha <= hasta),
    [diarios, desde, hasta],
  );
  const filasSel = useMemo(
    () => (cuentaSel === "todas" ? filas : filas.filter((d) => d.cuenta_id === cuentaSel)),
    [filas, cuentaSel],
  );

  const val = (d: VenuzDia, c: Canal) => (bruto ? d[`${c}_bruto` as const] : d[c]);
  const tot = (d: VenuzDia) => (bruto ? d.total_bruto : d.total);

  const totalNeto = filasSel.reduce((s, d) => s + d.total, 0);
  const totalBruto = filasSel.reduce((s, d) => s + d.total_bruto, 0);
  const totalVista = bruto ? totalBruto : totalNeto;

  const porCanal = CANALES.map((c) => {
    const importe = filasSel.reduce((s, d) => s + val(d, c.key), 0);
    return { ...c, importe, pct: totalVista > 0 ? (importe / totalVista) * 100 : 0 };
  });

  const porCuenta = cuentas
    .map((c) => {
      const f = filas.filter((d) => d.cuenta_id === c.id);
      return { cuenta: c, neto: f.reduce((s, d) => s + d.total, 0), bruto: f.reduce((s, d) => s + d.total_bruto, 0) };
    })
    .sort((a, b) => b.neto - a.neto);
  const totalTodas = porCuenta.reduce((s, x) => s + (bruto ? x.bruto : x.neto), 0);

  const porDia = useMemo(() => {
    const mapa = new Map<string, number>();
    // Hoy / ayer son un solo dia: el grafico muestra los 14 dias que terminan en ese dia, para dar contexto.
    const unDia = desde === hasta;
    const desdeGrafico = unDia ? dia(new Date(new Date(`${hasta}T00:00:00Z`).getTime() - 13 * 86400000)) : desde;
    for (const d of diarios) {
      if (d.fecha < desdeGrafico || d.fecha > hasta) continue;
      if (cuentaSel !== "todas" && d.cuenta_id !== cuentaSel) continue;
      mapa.set(d.fecha, (mapa.get(d.fecha) ?? 0) + tot(d));
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diarios, desde, hasta, cuentaSel, bruto]);
  const maxDia = Math.max(1, ...porDia.map(([, v]) => v));

  const mesesSel = meses
    .filter((m) => cuentaSel === "todas" || m.cuenta_id === cuentaSel)
    .reduce<Record<string, { neto: number; bruto: number; reembolsos: number; fans: number; nuevos: number; renov: number; ventas: number }>>((acc, m) => {
      const x = (acc[m.mes] ??= { neto: 0, bruto: 0, reembolsos: 0, fans: 0, nuevos: 0, renov: 0, ventas: 0 });
      x.neto += Number(m.total_neto); x.bruto += Number(m.total_bruto); x.reembolsos += Number(m.reembolsos);
      x.fans += m.fans_activos ?? 0; x.nuevos += m.fans_nuevos ?? 0; x.renov += m.renovaciones ?? 0; x.ventas += m.ventas ?? 0;
      return acc;
    }, {});
  const listaMeses = Object.entries(mesesSel).sort(([a], [b]) => b.localeCompare(a));

  async function vincular(cuentaId: string, modeloId: string) {
    setVinculando(cuentaId);
    setErrorVinculo(null);
    try {
      const res = await fetch("/api/venuz/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta_id: cuentaId, modelo_id: modeloId || null }),
      });
      if (!res.ok) setErrorVinculo(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo vincular");
      else router.refresh();
    } finally {
      setVinculando(null);
    }
  }

  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/10 text-[color:var(--text-secondary)] hover:text-white"}`;

  if (!cuentas.length) {
    return (
      <GlassCard className="p-6">
        <p className="text-sm font-medium text-white">Aún no hay datos de Venuz</p>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          El scraper del runner los trae solo cada pocas horas. Cuando esté configurado (usuario de Venuz en el VPS) o al pulsar «Sync Venuz», aparecerán aquí la facturación total, por creadora y por canal.
        </p>
        {ultimaSync?.resultado === "error" && ultimaSync.detalle?.error ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">Último intento: {ultimaSync.detalle.error}</p>
        ) : null}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} className={chip(periodo === p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setBruto(false)} className={chip(!bruto)} title="Lo que de verdad se cobra, tras la comisión de OnlyFans">Neto</button>
          <button onClick={() => setBruto(true)} className={chip(bruto)} title="Lo que pagan los fans, antes de la comisión de OnlyFans">Bruto</button>
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-[color:var(--text-secondary)]">Los días cuentan en UTC, igual que en Venuz.</p>
      {esDueno ? (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["todas", "Todas"],
              ["mias", "Mis modelos"],
              ["compartidas", "Compartidas con mi socio"],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              onClick={() => {
                setGrupo(id);
                setCuentaSel("todas");
              }}
              className={chip(grupo === id)}
            >
              {etiqueta} ({id === "todas" ? cuentasTodas.length : cuentasTodas.filter((c) => (id === "compartidas" ? c.ambito === "compartido" : c.ambito !== "compartido")).length})
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setCuentaSel("todas")} className={chip(cuentaSel === "todas")}>Todas las modelos</button>
        {cuentas.map((c) => {
          const m = c.modelo_id ? modeloPorId.get(c.modelo_id) : null;
          return (
            <button key={c.id} onClick={() => setCuentaSel(c.id)} className={`${chip(cuentaSel === c.id)} flex items-center gap-1.5`}>
              {m ? (
                <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-4 w-4 text-[8px]" />
              ) : c.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
              ) : null}
              {c.nombre}
            </button>
          );
        })}
      </div>

      {/* Totales */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-sm text-[color:var(--text-secondary)]">Facturación {bruto ? "bruta" : "neta"}</p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--accent)]">{usd(totalVista)}</p>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{filasSel.length ? `${new Set(filasSel.map((d) => d.fecha)).size} días con datos` : "Sin datos en este periodo"}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-sm text-[color:var(--text-secondary)]">{bruto ? "Neto (tras comisión OnlyFans)" : "Bruto (lo que pagan los fans)"}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{usd(bruto ? totalNeto : totalBruto)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-sm text-[color:var(--text-secondary)]">Comisión de OnlyFans</p>
          <p className="mt-2 text-3xl font-semibold text-white">{usd(totalBruto - totalNeto)}</p>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{totalBruto > 0 ? `${(((totalBruto - totalNeto) / totalBruto) * 100).toFixed(0)}% del bruto` : "—"}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* De qué parte viene el dinero */}
        <GlassCard className="p-5">
          <h3 className="text-sm font-semibold text-white">¿De dónde viene el dinero?</h3>
          <div className="mt-4 space-y-3">
            {porCanal.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-[color:var(--text-secondary)]">{c.label}</span>
                  <span className="text-white">{usd(c.importe)} <span className="text-xs text-[color:var(--text-secondary)]">· {c.pct.toFixed(1)}%</span></span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${c.color}`} style={{ width: `${Math.min(100, c.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Por día */}
        <GlassCard className="p-5">
          <h3 className="text-sm font-semibold text-white">Por día{desde === hasta ? <span className="ml-2 text-xs font-normal text-[color:var(--text-secondary)]">últimos 14 días</span> : null}</h3>
          {porDia.length ? (
            <>
              <div className="mt-4 flex h-40 items-end gap-[3px]">
                {porDia.map(([fecha, v]) => (
                  <div key={fecha} className="group relative flex-1" style={{ height: "100%" }}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t opacity-80 transition-opacity group-hover:opacity-100" style={{ height: `${Math.max(2, (v / maxDia) * 100)}%`, backgroundColor: "#8B5CF6" }} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-[10px] text-white group-hover:block">
                      {new Date(`${fecha}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })} · {usd(v)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[color:var(--text-secondary)]">
                <span>{new Date(`${porDia[0][0]}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <span>máx. {usd(maxDia)}/día</span>
                <span>{new Date(`${porDia[porDia.length - 1][0]}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--text-secondary)]">Sin datos en este periodo.</p>
          )}
        </GlassCard>
      </div>

      {/* Por modelo + vinculación */}
      <GlassCard className="overflow-hidden">
        <div className="border-b border-white/[0.08] p-4">
          <h3 className="text-sm font-semibold text-white">Por modelo</h3>
          <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">Vincula cada creadora de Venuz con su ficha del panel para ver su foto y enlazar sus datos.</p>
          {errorVinculo ? <p className="mt-2 text-xs text-red-400">{errorVinculo}</p> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/[0.08] text-[color:var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3 font-medium">Creadora en Venuz</th>
                <th className="px-4 py-3 font-medium">Modelo del panel</th>
                <th className="px-4 py-3 font-medium text-right">{bruto ? "Bruto" : "Neto"}</th>
                <th className="px-4 py-3 font-medium text-right">% del total</th>
                <th className="px-4 py-3 font-medium text-right">Fans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {porCuenta.map(({ cuenta, neto, bruto: br }) => {
                const m = cuenta.modelo_id ? modeloPorId.get(cuenta.modelo_id) : null;
                const importe = bruto ? br : neto;
                return (
                  <tr key={cuenta.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {cuenta.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cuenta.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-xs text-white/70">{cuenta.nombre.slice(0, 1)}</span>
                        )}
                        <div>
                          <p className="font-medium text-white">{cuenta.nombre}</p>
                          {cuenta.username ? <p className="text-xs text-[color:var(--text-secondary)]">@{cuenta.username}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m ? <AvatarModelo id={m.id} nombre={m.nombre} foto={m.foto} className="h-6 w-6 text-[10px]" /> : null}
                        <select
                          value={cuenta.modelo_id ?? ""}
                          disabled={vinculando === cuenta.id}
                          onChange={(e) => vincular(cuenta.id, e.target.value)}
                          className={`input-base py-1 text-xs ${cuenta.modelo_id ? "" : "border-amber-500/40 text-amber-300"}`}
                        >
                          <option value="">Sin vincular</option>
                          {modelos.map((mo) => (
                            <option key={mo.id} value={mo.id}>{mo.nombre}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">{usd(importe)}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{totalTodas > 0 ? `${((importe / totalTodas) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{cuenta.suscriptores ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Resumen mensual */}
      {listaMeses.length ? (
        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/[0.08] p-4">
            <h3 className="text-sm font-semibold text-white">Resumen mensual {cuentaSel === "todas" ? "(todas)" : `· ${cuentas.find((c) => c.id === cuentaSel)?.nombre ?? ""}`}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/[0.08] text-[color:var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Mes</th>
                  <th className="px-4 py-3 font-medium text-right">Neto</th>
                  <th className="px-4 py-3 font-medium text-right">Bruto</th>
                  <th className="px-4 py-3 font-medium text-right">Reembolsos</th>
                  <th className="px-4 py-3 font-medium text-right">Fans nuevos</th>
                  <th className="px-4 py-3 font-medium text-right">Renovaciones</th>
                  <th className="px-4 py-3 font-medium text-right">Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {listaMeses.map(([mes, x]) => (
                  <tr key={mes} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 capitalize text-white">{etiquetaMes(mes)}</td>
                    <td className="px-4 py-3 text-right text-white">{usd(x.neto)}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{usd(x.bruto)}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{x.reembolsos ? usd(x.reembolsos) : "—"}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{x.nuevos || "—"}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{x.renov || "—"}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--text-secondary)]">{x.ventas || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : null}

      {ultimaSync?.detalle?.problemas?.length ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          Avisos del último sync: {ultimaSync.detalle.problemas.slice(0, 3).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
