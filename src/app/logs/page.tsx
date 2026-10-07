import { PanelLayout } from "@/components/PanelLayout";
import { GlassCard } from "@/components/GlassCard";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { MarcarVista } from "./MarcarVista";

export const metadata = { title: "Actividad" };
export const revalidate = 0;

const PAGE_SIZE = 60;

interface SearchParams {
  origen?: string; // "usuarios" = lo que hace tu socio; vacio = sistema (agentes, runner...)
  usuario?: string;
  agente?: string;
  resultado?: string;
  page?: string;
}

type ActividadRow = {
  id: string;
  usuario: string;
  accion: string;
  sensible: boolean;
  ids: string[] | null;
  vista_at?: string | null;
  created_at: string;
};

type LogRow = {
  id: string;
  agente: string;
  accion: string;
  resultado: string;
  detalle?: { ids?: string[]; metodo?: string; ruta?: string } | null;
  duracion_ms?: number | null;
  created_at: string;
};

async function getActividad(params: SearchParams) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;
  const vacio = { data: [] as ActividadRow[], total: 0, page, pages: 1, usuariosVistos: [] as string[], nombres: new Map<string, string>(), tablaLista: true };
  if (!canUseSupabase()) return vacio;

  const supabase = createAdminClient();
  let query = supabase.from("panel_actividad").select("*", { count: "exact" });
  if (params.usuario) query = query.eq("usuario", params.usuario);
  if (params.resultado === "warning") query = query.eq("sensible", true);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) return { ...vacio, tablaLista: !/panel_actividad|relation/i.test(error.message) };
  const filas = (data ?? []) as ActividadRow[];

  const { data: u } = await supabase.from("panel_actividad").select("usuario").order("created_at", { ascending: false }).limit(500);
  const usuariosVistos = Array.from(new Set((u ?? []).map((f) => String(f.usuario))));
  // Nombre de lo que se ha tocado (modelo, cuenta, contraseña del Vault...)
  const nombres = new Map<string, string>();
  const ids = Array.from(new Set(filas.flatMap((f) => f.ids ?? [])));
  if (ids.length) {
    const [mod, cue, vau, ref] = await Promise.all([
      supabase.from("modelos").select("id, nombre").in("id", ids),
      supabase.from("cuentas_instagram").select("id, username").in("id", ids),
      supabase.from("vault_panel").select("id, nombre").in("id", ids),
      supabase.from("referencias_cuentas").select("id, username").in("id", ids),
    ]);
    for (const m of mod.data ?? []) nombres.set(m.id as string, `Modelo ${m.nombre}`);
    for (const c of cue.data ?? []) nombres.set(c.id as string, `Cuenta @${c.username}`);
    for (const v of vau.data ?? []) nombres.set(v.id as string, `Vault: ${v.nombre}`);
    for (const r of ref.data ?? []) nombres.set(r.id as string, `Referencia @${r.username}`);
  }
  return { data: filas, total: count ?? 0, page, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)), usuariosVistos, nombres, tablaLista: true };
}

async function getLogs(params: SearchParams) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;
  if (!canUseSupabase()) return { data: [] as LogRow[], total: 0, page, pages: 1 };

  let query = createAdminClient().from("log_agentes").select("*", { count: "exact" });
  if (params.agente) query = query.eq("agente", params.agente);
  if (params.resultado) query = query.eq("resultado", params.resultado);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { data: (data ?? []) as LogRow[], total: count ?? 0, page, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

function buildUrl(base: SearchParams, patch: Record<string, string | undefined>) {
  const params = { ...base, ...patch };
  const qs = Object.entries(params).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value!)}`).join("&");
  return `/logs${qs ? `?${qs}` : ""}`;
}

const RESULT_STYLE: Record<string, string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  error: "border-red-400/30 bg-red-400/10 text-red-300",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
};

const chip = (activo: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activo ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/10 text-white/50 hover:text-white/80"}`;

const cuandoTexto = (iso: string) => new Date(iso).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function LogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const sesion = await sesionPanelActual();
  const esDueno = sesion?.dueno ?? false;
  const usuarios = esDueno && params.origen === "usuarios"; // la actividad de los usuarios solo la ve el dueño
  const act = usuarios ? await getActividad(params) : null;
  const sis = usuarios ? null : await getLogs(params);
  const total = act?.total ?? sis?.total ?? 0;
  const page = act?.page ?? sis?.page ?? 1;
  const pages = act?.pages ?? sis?.pages ?? 1;
  const usuariosVistos = act?.usuariosVistos ?? [];
  const nombres = act?.nombres ?? new Map<string, string>();

  return (
    <PanelLayout>
      <div className="space-y-5">
        {usuarios ? <MarcarVista hayNuevos={(act?.data ?? []).some((l) => l.sensible && !l.vista_at)} /> : null}
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">{usuarios ? "Todo lo que hace tu socio en el panel" : "Lo que hace el sistema por su cuenta"}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Actividad</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {esDueno ? (
            <>
              <a href="/logs?origen=usuarios" className={chip(usuarios)}>Tu socio</a>
              <a href="/logs" className={chip(!usuarios)}>Sistema</a>
              <span className="mx-1 h-5 w-px bg-white/10" />
            </>
          ) : null}
          {usuarios ? (
            <>
              {usuariosVistos.length > 1
                ? usuariosVistos.map((u) => (
                    <a key={u} href={buildUrl(params, { usuario: params.usuario === u ? undefined : u, page: "1" })} className={chip(params.usuario === u)}>{u}</a>
                  ))
                : null}
              <a href={buildUrl(params, { resultado: params.resultado === "warning" ? undefined : "warning", page: "1" })} className={chip(params.resultado === "warning")}>Solo sensibles</a>
            </>
          ) : (
            ["ok", "error", "warning"].map((resultado) => (
              <a key={resultado} href={buildUrl(params, { resultado: params.resultado === resultado ? undefined : resultado, page: "1" })} className={chip(params.resultado === resultado)}>{resultado}</a>
            ))
          )}
          {params.agente || params.resultado || params.usuario ? <a href={usuarios ? "/logs?origen=usuarios" : "/logs"} className="px-2 text-xs text-white/40 hover:text-white/70">× limpiar</a> : null}
          <span className="ml-auto text-xs text-white/40">{total.toLocaleString("es")} entradas</span>
        </div>

        {usuarios ? (
          <GlassCard className="overflow-hidden p-0">
            {act && !act.tablaLista ? (
              <p className="py-14 text-center text-sm text-amber-300">Falta ejecutar el SQL <code>20261015_panel_actividad.sql</code> en Supabase para que se guarde la actividad.</p>
            ) : act && act.data.length === 0 ? (
              <p className="py-14 text-center text-sm text-white/40">Todavía no hay actividad de usuarios.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {(act?.data ?? []).map((log) => {
                  const sobre = (log.ids ?? []).map((id) => nombres.get(id)).filter(Boolean) as string[];
                  return (
                    <li key={log.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 ${log.sensible ? "bg-amber-400/[0.04]" : ""}`}>
                      <span className="w-28 shrink-0 text-xs text-white/40">{cuandoTexto(log.created_at)}</span>
                      <span className="w-28 shrink-0 truncate text-sm font-semibold text-cyan-200">{log.usuario}</span>
                      <span className="min-w-0 flex-1 text-sm text-white">
                        {log.accion}
                        {sobre.length ? <span className="text-white/45"> · {sobre.join(", ")}</span> : null}
                      </span>
                      {log.sensible && !log.vista_at ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Nuevo</span> : null}
                      {log.sensible ? <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">Sensible</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  {["Agente", "Acción", "Resultado", "Duración", "Cuándo"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-white/40">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(sis?.data ?? []).length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-white/40">Sin entradas</td></tr> : null}
                {(sis?.data ?? []).map((log) => (
                  <tr key={log.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5"><span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-white/80">{log.agente}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-white">{log.accion}</div>
                      {log.detalle ? (
                        <details className="cursor-pointer">
                          <summary className="cursor-pointer list-none text-[10px] text-white/35">ver detalle ▾</summary>
                          <pre className="mt-1 max-w-sm overflow-x-auto rounded bg-black/30 p-2 text-[10px] text-white/50">{JSON.stringify(log.detalle, null, 2)}</pre>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5"><span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${RESULT_STYLE[log.resultado] ?? "border-white/10 text-white/50"}`}>{log.resultado}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-white/40">{log.duracion_ms ? `${log.duracion_ms}ms` : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-white/45">{cuandoTexto(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}

        {pages > 1 ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/45">Página {page} de {pages}</span>
            <div className="flex gap-2">
              {page > 1 ? <a href={buildUrl(params, { page: String(page - 1) })} className="btn-secondary px-4 py-1.5 text-sm">← Anterior</a> : null}
              {page < pages ? <a href={buildUrl(params, { page: String(page + 1) })} className="btn-secondary px-4 py-1.5 text-sm">Siguiente →</a> : null}
            </div>
          </div>
        ) : null}
      </div>
    </PanelLayout>
  );
}
