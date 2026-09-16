import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Actividad" };
export const revalidate = 0;

const PAGE_SIZE = 60;

interface SearchParams {
  agente?: string;
  resultado?: string;
  page?: string;
}

type LogRow = {
  id: string;
  agente: string;
  accion: string;
  resultado: string;
  detalle?: unknown;
  duracion_ms?: number | null;
  created_at: string;
};

async function getLogs(params: SearchParams) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;

  if (!canUseSupabase()) {
    const data: LogRow[] = [
      { id: "log-demo-1", agente: "venuz-sync", accion: "manual_sync_triggered", resultado: "ok", detalle: { source: "demo" }, duracion_ms: 220, created_at: new Date().toISOString() },
      { id: "log-demo-2", agente: "editor", accion: "video_ready_for_approval", resultado: "warning", detalle: { queue: "aprobacion" }, duracion_ms: 840, created_at: new Date(Date.now() - 3600000).toISOString() },
    ].filter((log) => (!params.resultado || log.resultado === params.resultado) && (!params.agente || log.agente === params.agente));
    return { data, total: data.length, page, pages: 1 };
  }

  const supabase = createAdminClient();
  let query = supabase.from("log_agentes").select("*", { count: "exact" });
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
  ok: "bg-green-500/15 text-green-400",
  error: "bg-red-500/15 text-red-400",
  warning: "bg-amber-500/15 text-amber-400",
};

export default async function LogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { data, total, page, pages } = await getLogs(params);

  return (
    <PanelLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-halo-text">Actividad del sistema</h1>
            <p className="mt-1 text-sm text-halo-subtle">{total.toLocaleString("es")} entradas</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["ok", "error", "warning"].map((resultado) => (
              <a key={resultado} href={buildUrl(params, { resultado: params.resultado === resultado ? undefined : resultado, page: "1" })} className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${params.resultado === resultado ? (resultado === "ok" ? "border-green-500/30 bg-green-500/20 text-green-400" : resultado === "error" ? "border-red-500/30 bg-red-500/20 text-red-400" : "border-amber-500/30 bg-amber-500/20 text-amber-400") : "border-halo-border text-halo-subtle hover:text-halo-text"}`}>
                {resultado}
              </a>
            ))}
            {params.agente || params.resultado ? <a href="/logs" className="px-2 text-xs text-halo-subtle hover:text-halo-text">x limpiar</a> : null}
          </div>
        </div>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-halo-border">{["Agente", "Accion", "Resultado", "Duracion", "Cuando"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-halo-subtle">{heading}</th>)}</tr></thead>
            <tbody>
              {data.length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-halo-subtle">Sin entradas</td></tr> : null}
              {data.map((log) => (
                <tr key={log.id} className="border-b border-halo-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5"><span className="rounded bg-halo-muted/60 px-2 py-0.5 font-mono text-xs text-halo-text">{log.agente}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-halo-text">{log.accion}</div>
                    {log.detalle ? <details className="cursor-pointer"><summary className="cursor-pointer list-none text-[10px] text-halo-subtle">ver detalle ▾</summary><pre className="mt-1 max-w-sm overflow-x-auto rounded bg-halo-bg p-2 text-[10px] text-halo-subtle">{JSON.stringify(log.detalle, null, 2)}</pre></details> : null}
                  </td>
                  <td className="px-4 py-2.5"><span className={`badge text-[10px] ${RESULT_STYLE[log.resultado] ?? "bg-halo-muted text-halo-subtle"}`}>{log.resultado}</span></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-halo-subtle">{log.duracion_ms ? `${log.duracion_ms}ms` : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-halo-subtle">{new Date(log.created_at).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 ? <div className="flex items-center justify-between"><span className="text-sm text-halo-subtle">Pagina {page} de {pages}</span><div className="flex gap-2">{page > 1 ? <a href={buildUrl(params, { page: String(page - 1) })} className="btn-secondary px-4 py-1.5 text-sm">← Anterior</a> : null}{page < pages ? <a href={buildUrl(params, { page: String(page + 1) })} className="btn-secondary px-4 py-1.5 text-sm">Siguiente →</a> : null}</div></div> : null}
      </div>
    </PanelLayout>
  );
}
