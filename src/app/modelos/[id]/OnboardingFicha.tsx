import { CopiarOnboarding } from "./CopiarOnboarding";
import {
  LIMITES,
  SECCIONES,
  onboardingATexto,
  progresoOnboarding,
  type Campo,
  type DatosOnboarding,
} from "@/lib/onboarding";

const ICONO: Record<string, string> = {
  personaje: "👤",
  personalidad: "✨",
  fisico: "📏",
  customs: "🎬",
  limites: "🚫",
  vida: "☕",
  historia: "📖",
};

function fechaHora(valor: string, segundos = false) {
  return new Date(valor).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(segundos ? { second: "2-digit" } : {}),
  });
}

function Valor({ campo, datos }: { campo: Campo; datos: DatosOnboarding }) {
  const v = String(datos[campo.id] ?? "");
  if (campo.tipo === "sino") {
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${v === "si" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"}`}>
        {v === "si" ? "Sí" : "No"}
      </span>
    );
  }
  if (v.length > 160) {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none text-halo-text">
          <span className="whitespace-pre-wrap break-words">{v.slice(0, 130).trimEnd()}…</span>{" "}
          <span className="text-xs font-semibold text-halo-accent group-open:hidden">ver todo</span>
        </summary>
        <p className="mt-1 whitespace-pre-wrap break-words text-halo-text">{v}</p>
      </details>
    );
  }
  return <span className="whitespace-pre-wrap break-words text-halo-text">{v}</span>;
}

export function OnboardingFicha({
  modelo,
  onboarding,
  datos,
  historial,
}: {
  modelo: { id: string; nombre: string };
  onboarding: { estado: string; enviado_at: string | null; updated_at: string } | null;
  datos: DatosOnboarding;
  historial: Array<{ id: string; origen: string; created_at: string }>;
}) {
  if (!onboarding) {
    return (
      <div className="card flex flex-col items-center gap-2 py-10 text-center">
        <span className="text-4xl" aria-hidden="true">📝</span>
        <p className="font-display text-lg font-semibold text-halo-text">Todavía no ha empezado el onboarding</p>
        <p className="max-w-md text-sm text-halo-subtle">
          Cuando entre en su portal y rellene el formulario, sus respuestas aparecerán aquí, ordenadas por secciones y con historial de versiones.
        </p>
      </div>
    );
  }

  const progreso = progresoOnboarding(datos);
  const enviado = onboarding.estado === "enviado";

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 !p-4">
        <span className={`badge ${enviado ? "bg-green-500/20 text-green-400" : "bg-amber-500/15 text-amber-300"}`}>
          {enviado ? `Enviado ${onboarding.enviado_at ? fechaHora(onboarding.enviado_at) : ""}` : "A medias"}
        </span>
        <div className="min-w-[160px] flex-1">
          <div className="mb-1 flex justify-between text-xs text-halo-subtle">
            <span>Obligatorios completados</span>
            <span className="font-semibold text-halo-text">{progreso}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA]" style={{ width: `${progreso}%` }} />
          </div>
        </div>
        <span className="text-xs text-halo-subtle">Última edición: {fechaHora(onboarding.updated_at)}</span>
        <div className="flex flex-wrap items-center gap-2">
          <CopiarOnboarding texto={onboardingATexto(modelo.nombre, datos)} />
          <a href={`/api/modelos/${modelo.id}/onboarding?formato=txt`} className="btn-secondary px-3 py-1.5 text-xs">
            .txt
          </a>
          <a href={`/api/modelos/${modelo.id}/onboarding?formato=json`} className="btn-secondary px-3 py-1.5 text-xs" title="Incluye todas las versiones">
            Copia .json
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {SECCIONES.map((seccion) => {
          const rellenos = seccion.campos.filter((c) => String(datos[c.id] ?? "").trim());
          const vacios = seccion.campos.filter((c) => !String(datos[c.id] ?? "").trim());
          const limitesMarcados = (datos.limites ?? []).map((lid) => LIMITES.find((l) => l.id === lid)?.es ?? lid);
          const total = seccion.campos.length;
          const completa = rellenos.length === total;
          return (
            <section key={seccion.id} className="card flex flex-col !p-4">
              <header className="mb-3 flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lg" aria-hidden="true">
                  {ICONO[seccion.id] ?? "•"}
                </span>
                <h3 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-halo-text">{seccion.titulo}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${completa ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-halo-subtle"}`}>
                  {rellenos.length}/{total}
                </span>
              </header>

              {seccion.limites ? (
                <div className="mb-3">
                  <p className="mb-1.5 text-[11px] uppercase tracking-wider text-halo-subtle">No hace</p>
                  {limitesMarcados.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {limitesMarcados.map((l) => (
                        <span key={l} className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-300">
                          {l}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-halo-subtle">Ninguno de la lista</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-halo-subtle">Lista revisada: {datos.revisado ? "sí" : "no"}</p>
                </div>
              ) : null}

              {rellenos.length ? (
                <dl className="space-y-2.5 text-sm">
                  {rellenos.map((campo) => (
                    <div key={campo.id}>
                      <dt className="text-[11px] uppercase tracking-wider text-halo-subtle">{campo.label}</dt>
                      <dd className="mt-0.5">
                        <Valor campo={campo} datos={datos} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-halo-subtle">Sin rellenar todavía.</p>
              )}

              {vacios.length && rellenos.length ? (
                <details className="mt-3 border-t border-halo-border pt-2 text-xs text-halo-subtle">
                  <summary className="cursor-pointer">{vacios.length} sin rellenar</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    {vacios.map((c) => (
                      <li key={c.id}>{c.label}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>

      <details className="card !p-4 text-sm">
        <summary className="cursor-pointer text-halo-subtle">
          Historial de versiones guardadas ({historial.length}
          {historial.length === 50 ? "+" : ""}) — nunca se borran
        </summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 font-mono text-xs text-halo-subtle sm:grid-cols-2">
          {historial.map((h) => (
            <li key={h.id}>
              {fechaHora(h.created_at, true)} · {h.origen}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-halo-subtle">La copia .json incluye el contenido completo de cada versión.</p>
      </details>
    </div>
  );
}
