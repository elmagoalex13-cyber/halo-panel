"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIMITES,
  SECCIONES,
  progresoOnboarding,
  seccionDeCampo,
  type Campo,
  type DatosOnboarding,
  type ErroresOnboarding,
} from "@/lib/onboarding";

type Estado = "borrador" | "enviado";
type Guardado = "ok" | "guardando" | "error";

// Copia local en el movil: si falla la red o se cierra la pagina, no se pierde nada.
const claveLocal = (slug: string) => `halo-onboarding-${slug}`;

function leerLocal(slug: string): DatosOnboarding {
  try {
    return JSON.parse(localStorage.getItem(claveLocal(slug)) ?? "{}") as DatosOnboarding;
  } catch {
    return {};
  }
}

// El servidor manda; la copia local solo rellena huecos que el servidor aun no tiene.
function fusionar(servidor: DatosOnboarding, local: DatosOnboarding): DatosOnboarding {
  const out: DatosOnboarding = { ...servidor };
  for (const [k, v] of Object.entries(local)) {
    if (k === "limites") {
      if (!out.limites?.length && Array.isArray(v)) out.limites = v as string[];
    } else if (k === "revisado") {
      if (!out.revisado && v === true) out.revisado = true;
    } else if (typeof v === "string" && v.trim() && !String(out[k] ?? "").trim()) {
      out[k] = v;
    }
  }
  return out;
}

function CampoInput({
  campo,
  valor,
  error,
  onChange,
}: {
  campo: Campo;
  valor: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const base = `input-base w-full text-sm ${error ? "border-red-400/60" : ""}`;
  return (
    <div data-campo={campo.id} className="space-y-1.5">
      <label className="block text-sm font-semibold text-white/85" htmlFor={`ob-${campo.id}`}>
        {campo.label}
        {campo.requerido ? <span className="ml-1 text-[#A78BFA]">*</span> : null}
      </label>
      {campo.hint ? <p className="text-xs leading-relaxed text-white/40">{campo.hint}</p> : null}
      {campo.tipo === "textarea" ? (
        <>
          <textarea
            id={`ob-${campo.id}`}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            rows={campo.max && campo.max > 500 ? 6 : 4}
            maxLength={campo.max}
            placeholder={campo.placeholder}
            className={`${base} resize-y`}
          />
          {campo.max ? (
            <p className="text-right text-[11px] text-white/25">
              {valor.length} / {campo.max}
            </p>
          ) : null}
        </>
      ) : campo.tipo === "sino" ? (
        <div className="flex gap-2">
          {[
            ["si", "Sí"],
            ["no", "No"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(valor === v ? "" : v)}
              aria-pressed={valor === v}
              className={`min-h-11 flex-1 rounded-xl border px-4 text-sm font-semibold transition ${
                valor === v ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/25 text-white" : "border-white/10 bg-white/[0.04] text-white/55"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <input
          id={`ob-${campo.id}`}
          type={campo.tipo === "number" ? "number" : "text"}
          inputMode={campo.tipo === "number" ? "numeric" : undefined}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          maxLength={campo.tipo === "number" ? undefined : campo.max}
          placeholder={campo.placeholder}
          className={base}
        />
      )}
      {error ? <p className="text-xs font-medium text-red-300">{error}</p> : null}
    </div>
  );
}

export function OnboardingForm({
  slug,
  datosIniciales,
  estadoInicial,
  onCerrar,
  onCambio,
}: {
  slug: string;
  datosIniciales: DatosOnboarding;
  estadoInicial: Estado;
  onCerrar: () => void;
  onCambio: (datos: DatosOnboarding, estado: Estado) => void;
}) {
  const [datos, setDatos] = useState<DatosOnboarding>(() => fusionar(datosIniciales, typeof window === "undefined" ? {} : leerLocal(slug)));
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [paso, setPaso] = useState(0);
  const [guardado, setGuardado] = useState<Guardado>("ok");
  const [errores, setErrores] = useState<ErroresOnboarding>({});
  const [enviando, setEnviando] = useState(false);
  const [mensajeEnvio, setMensajeEnvio] = useState<{ ok: boolean; texto: string } | null>(null);
  const sucio = useRef(false);
  const ultimo = useRef(datos);
  ultimo.current = datos;

  const totalPasos = SECCIONES.length + 1; // + revision final
  const progreso = progresoOnboarding(datos);

  const guardar = useCallback(
    async (enviar = false, keepalive = false): Promise<{ ok: boolean; errores?: ErroresOnboarding; estado?: Estado }> => {
      const snapshot = ultimo.current;
      setGuardado("guardando");
      try {
        const res = await fetch("/api/portal/onboarding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ datos: snapshot, enviar }),
          keepalive,
        });
        if (res.status === 422) {
          const j = (await res.json()) as { errores?: ErroresOnboarding };
          setGuardado("ok");
          return { ok: false, errores: j.errores };
        }
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { estado: Estado };
        if (ultimo.current === snapshot) sucio.current = false;
        setGuardado("ok");
        setEstado(j.estado);
        onCambio(snapshot, j.estado);
        return { ok: true, estado: j.estado };
      } catch {
        setGuardado("error");
        return { ok: false };
      }
    },
    [onCambio],
  );

  // Si la copia local aportaba algo que el servidor no tenia, se sube.
  useEffect(() => {
    if (JSON.stringify(ultimo.current) !== JSON.stringify(datosIniciales)) {
      sucio.current = true;
      setDatos((d) => ({ ...d }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Copia local inmediata + autoguardado en servidor (debounce).
  useEffect(() => {
    if (!sucio.current) return;
    try {
      localStorage.setItem(claveLocal(slug), JSON.stringify(datos));
    } catch {}
    const t = setTimeout(() => void guardar(), 1500);
    return () => clearTimeout(t);
  }, [datos, slug, guardar]);

  // Reintento si hubo error de red.
  useEffect(() => {
    if (guardado !== "error") return;
    const t = setInterval(() => {
      if (sucio.current) void guardar();
    }, 8000);
    return () => clearInterval(t);
  }, [guardado, guardar]);

  // Al cerrar o ocultar la pagina, empuja lo pendiente.
  useEffect(() => {
    function alSalir() {
      if (sucio.current) void guardar(false, true);
    }
    function alOcultar() {
      if (document.visibilityState === "hidden") alSalir();
    }
    window.addEventListener("pagehide", alSalir);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      window.removeEventListener("pagehide", alSalir);
      document.removeEventListener("visibilitychange", alOcultar);
    };
  }, [guardar]);

  function cambiar(id: string, valor: string) {
    sucio.current = true;
    setDatos((d) => ({ ...d, [id]: valor }));
    setErrores((e) => {
      if (!e[id]) return e;
      const { [id]: _omit, ...resto } = e;
      void _omit;
      return resto;
    });
  }

  function alternarLimite(id: string) {
    sucio.current = true;
    setDatos((d) => {
      const actuales = d.limites ?? [];
      return { ...d, limites: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id] };
    });
  }

  function irA(n: number) {
    setPaso(Math.max(0, Math.min(totalPasos - 1, n)));
    document.getElementById("ob-scroll")?.scrollTo({ top: 0 });
  }

  async function cerrar() {
    if (sucio.current) await guardar();
    onCerrar();
  }

  async function enviar() {
    setEnviando(true);
    setMensajeEnvio(null);
    const r = await guardar(true);
    setEnviando(false);
    if (r.ok) {
      setErrores({});
      setMensajeEnvio({ ok: true, texto: "¡Enviado! Hemos recibido todas tus respuestas. Puedes volver a editarlas cuando quieras." });
      return;
    }
    if (r.errores) {
      setErrores(r.errores);
      const primero = Object.keys(r.errores)[0];
      const destino = seccionDeCampo(primero);
      if (destino >= 0) irA(destino);
      setMensajeEnvio({ ok: false, texto: "Faltan campos obligatorios. Te los hemos marcado en rojo." });
    } else {
      setMensajeEnvio({ ok: false, texto: "No hemos podido enviarlo ahora mismo. Tus respuestas están a salvo en este móvil; inténtalo de nuevo en un momento." });
    }
  }

  const esRevision = paso === SECCIONES.length;
  const seccion = esRevision ? null : SECCIONES[paso];
  const faltan = SECCIONES.flatMap((s) => s.campos.filter((c) => c.requerido && !String(datos[c.id] ?? "").trim())).map((c) => c.label);
  if (datos.revisado !== true) faltan.push("Confirmar la lista de límites");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#060509]" role="dialog" aria-modal="true" aria-label="Tu perfil de creadora">
      <header className="shrink-0 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-white">Tu perfil de creadora</p>
            <p className="text-xs text-white/40">
              {esRevision ? "Revisar y enviar" : `Paso ${paso + 1} de ${totalPasos - 1} · ${seccion?.titulo}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`text-xs font-medium ${guardado === "error" ? "text-amber-300" : guardado === "guardando" ? "text-white/40" : "text-emerald-300"}`}
              aria-live="polite"
            >
              {guardado === "error" ? "Sin conexión · a salvo en tu móvil" : guardado === "guardando" ? "Guardando…" : "Guardado ✓"}
            </span>
            <button type="button" onClick={cerrar} className="btn-secondary min-h-11 px-4 text-xs">
              Cerrar
            </button>
          </div>
        </div>
        <div className="mx-auto mt-3 flex w-full max-w-2xl gap-1" aria-hidden="true">
          {Array.from({ length: totalPasos }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => irA(i)}
              className={`h-1.5 flex-1 rounded-full transition ${i <= paso ? "bg-[#8B5CF6]" : "bg-white/10"}`}
              tabIndex={-1}
            />
          ))}
        </div>
      </header>

      <div id="ob-scroll" className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-2xl space-y-5 pb-6">
          {seccion ? (
            <>
              <div>
                <h2 className="font-display text-xl font-semibold text-white">{seccion.titulo}</h2>
                {seccion.intro ? <p className="mt-1 text-sm leading-relaxed text-white/50">{seccion.intro}</p> : null}
              </div>

              {seccion.limites ? (
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" role="group" aria-label="Límites">
                  {LIMITES.map((l) => {
                    const on = (datos.limites ?? []).includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => alternarLimite(l.id)}
                        aria-pressed={on}
                        className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm transition ${
                          on ? "border-red-400/50 bg-red-500/15 text-white" : "border-white/10 bg-white/[0.04] text-white/65"
                        }`}
                      >
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${on ? "border-red-300 bg-red-500/40 text-white" : "border-white/25"}`}>
                          {on ? "✕" : ""}
                        </span>
                        {l.es}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {seccion.campos.map((c) => (
                <CampoInput key={c.id} campo={c} valor={String(datos[c.id] ?? "")} error={errores[c.id]} onChange={(v) => cambiar(c.id, v)} />
              ))}

              {seccion.limites ? (
                <div data-campo="revisado" className="space-y-1.5">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={datos.revisado === true}
                      onChange={(e) => {
                        sucio.current = true;
                        setDatos((d) => ({ ...d, revisado: e.target.checked }));
                        setErrores((er) => {
                          const { revisado: _r, ...resto } = er;
                          void _r;
                          return resto;
                        });
                      }}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#8B5CF6]"
                    />
                    He revisado toda la lista y lo que no he marcado es negociable.
                    <span className="text-[#A78BFA]">*</span>
                  </label>
                  {errores.revisado ? <p className="text-xs font-medium text-red-300">{errores.revisado}</p> : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <h2 className="font-display text-xl font-semibold text-white">
                  {estado === "enviado" ? "Tu perfil está enviado" : "Último paso: enviar"}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-white/50">
                  Tus respuestas se guardan solas mientras escribes. Al enviar, nos llegan a nosotros. Puedes volver y cambiarlas cuando quieras.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-white/70">Obligatorios completados</span>
                  <span className="font-semibold text-white">{progreso}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#8B5CF6] transition-all" style={{ width: `${progreso}%` }} />
                </div>
                {faltan.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200/90">
                    {faltan.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-emerald-300">Todo lo obligatorio está completo.</p>
                )}
              </div>
              {mensajeEnvio ? (
                <p className={`rounded-xl px-3 py-2 text-sm ${mensajeEnvio.ok ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>
                  {mensajeEnvio.texto}
                </p>
              ) : null}
              <button type="button" onClick={enviar} disabled={enviando} className="btn-primary h-12 w-full text-sm disabled:opacity-60">
                {enviando ? "Enviando…" : estado === "enviado" ? "Enviar de nuevo con mis cambios" : "Enviar mi perfil"}
              </button>
            </>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-2xl gap-3">
          <button type="button" onClick={() => irA(paso - 1)} disabled={paso === 0} className="btn-secondary min-h-12 flex-1 text-sm disabled:opacity-30">
            Atrás
          </button>
          {esRevision ? (
            <button type="button" onClick={cerrar} className="btn-secondary min-h-12 flex-1 text-sm">
              Salir
            </button>
          ) : (
            <button type="button" onClick={() => irA(paso + 1)} className="btn-primary min-h-12 flex-1 text-sm">
              {paso === SECCIONES.length - 1 ? "Revisar y enviar" : "Siguiente"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
