"use client";

import { useEffect, useRef, useState } from "react";
import { FirmaPad } from "@/components/FirmaPad";
import { CONTRATO_AGENCIA, CONTRATO_CLAUSULAS, CONTRATO_TITULO } from "@/lib/contratoTexto";
import { PREGUNTAS_FRECUENTES, RESUMEN_ESENCIAL } from "@/lib/contratoExplicacion";
import { primerNombre } from "@/lib/leadsMensajes";

const fechaLarga = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

export function ContratoPublico({ token, nombre, fechaInicio, firmaAgencia, firmado: yaFirmado, firmadoAt }: { token: string; nombre: string; fechaInicio: string; firmaAgencia: string | null; firmado: boolean; firmadoAt: string | null }) {
  const [firmado, setFirmado] = useState(yaFirmado);
  const [nombreFirmante, setNombreFirmante] = useState(nombre);
  const [dni, setDni] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zonaFirma = useRef<HTMLElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const nombrePila = primerNombre(nombre);

  async function firmar() {
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/contrato/${token}/firmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_firmante: nombreFirmante, dni, firma, acepta }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo firmar. Inténtalo otra vez.");
      setFirmado(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo firmar");
    } finally {
      setEnviando(false);
    }
  }

  if (firmado) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10">
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-8 text-center">
          <p className="text-5xl">✅</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-white">¡Contrato firmado{nombrePila ? `, ${nombrePila}` : ""}!</h1>
          <p className="mt-3 text-white/70">
            Hemos recibido tu firma{firmadoAt ? ` el ${new Date(firmadoAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}` : ""}. En breve nos pondremos en contacto contigo para los siguientes pasos.
          </p>
          <a href={`/api/contrato/${token}/pdf`} className="btn-primary mt-6 inline-flex min-h-12 items-center justify-center px-6 text-base">
            Descargar mi copia (PDF)
          </a>
        </div>
      </main>
    );
  }

  const puedeFirmar = acepta && nombreFirmante.trim().length >= 3 && dni.trim().length >= 5 && Boolean(firma) && !enviando;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-5 px-4 py-8 pb-24">
      <header className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/halo-logo.png" alt="Halo Models Agency" className="mx-auto h-24 w-24 rounded-2xl object-cover" />
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">Hola{nombrePila ? `, ${nombrePila}` : ""}, este es tu contrato</h1>
        <p className="mx-auto mt-2 max-w-md text-white/60">Léelo con calma. Si algo no lo entiendes, escríbenos antes de firmar.</p>
      </header>

      <section aria-labelledby="esencial" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 id="esencial" className="font-display text-xl font-semibold text-white">Lo esencial</h2>
        <ul className="mt-4 space-y-4">
          {RESUMEN_ESENCIAL.map((r) => (
            <li key={r.titulo} className="flex gap-3">
              <span className="text-2xl leading-none">{r.icono}</span>
              <div>
                <p className="font-semibold text-white">{r.titulo}</p>
                <p className="text-sm leading-relaxed text-white/65">{r.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contrato" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 id="contrato" className="font-display text-xl font-semibold text-white">Tu contrato</h2>
        <dl className="mt-3 space-y-1 text-sm text-white/70">
          <div className="flex justify-between gap-3"><dt className="text-white/40">Entre</dt><dd className="text-right">{CONTRATO_AGENCIA}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-white/40">y</dt><dd className="text-right font-semibold text-white">{nombre}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-white/40">Fecha de inicio</dt><dd className="text-right">{fechaLarga(fechaInicio)}</dd></div>
        </dl>


        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setLeyendo(true)} className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-4 text-base">
            📖 Leer el contrato
          </button>
          <a href={`/api/contrato/${token}/pdf`} className="btn-secondary inline-flex min-h-12 items-center justify-center px-4 text-base">
            ⬇ Descargar PDF
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">Se abre en una pantalla de lectura, con índice por cláusulas.</p>
      </section>

      <section ref={zonaFirma} aria-labelledby="firmar" className="rounded-3xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 p-5">
        <h2 id="firmar" className="font-display text-xl font-semibold text-white">Firmar el contrato</h2>
        <p className="mt-1 text-sm text-white/60">Tu firma tiene validez como aceptación del contrato. Quedan registrados la fecha, la hora y tu conexión.</p>
        <div className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Nombre completo</span>
            <input value={nombreFirmante} onChange={(e) => setNombreFirmante(e.target.value)} autoComplete="name" className="input-base w-full" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">DNI / NIE</span>
            <input value={dni} onChange={(e) => setDni(e.target.value)} autoComplete="off" placeholder="12345678Z" className="input-base w-full" />
          </label>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Tu firma</span>
            <div className="mt-1.5">
              <FirmaPad onChange={setFirma} />
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-black/20 p-3">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#8B5CF6]" />
            <span className="text-sm leading-relaxed text-white/80">He leído y entiendo el contrato completo, soy mayor de edad y acepto sus condiciones.</span>
          </label>
          {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
          <button type="button" onClick={firmar} disabled={!puedeFirmar} className="btn-primary min-h-14 w-full text-base disabled:opacity-40">
            {enviando ? "Firmando…" : "Firmar contrato"}
          </button>
        </div>
        {firmaAgencia ? (
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 text-xs text-white/45">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={firmaAgencia} alt="Firma de la agencia" className="h-10 rounded bg-white px-2" />
            <span>Ya firmado por {CONTRATO_AGENCIA}.</span>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="faq" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 id="faq" className="font-display text-xl font-semibold text-white">Preguntas frecuentes</h2>
        <div className="mt-3 space-y-2">
          {PREGUNTAS_FRECUENTES.map((f) => (
            <details key={f.p} className="group rounded-xl bg-black/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white">
                <span>{f.p}</span>
                <span className="text-white/40 transition group-open:rotate-180">▾</span>
              </summary>
              <p className="px-4 pb-3 text-sm leading-relaxed text-white/65">{f.r}</p>
            </details>
          ))}
        </div>
      </section>

      {leyendo ? (
        <LectorContrato
          nombre={nombre}
          fechaInicio={fechaInicio}
          token={token}
          onCerrar={() => setLeyendo(false)}
          onFirmar={() => {
            setLeyendo(false);
            setTimeout(() => zonaFirma.current?.scrollIntoView({ behavior: "smooth" }), 80);
          }}
        />
      ) : null}
    </main>
  );
}

/** Pantalla de lectura del contrato: texto grande, índice por cláusulas y barra de progreso. Al terminar, lleva a firmar. */
function LectorContrato({ nombre, fechaInicio, token, onCerrar, onFirmar }: { nombre: string; fechaInicio: string; token: string; onCerrar: () => void; onFirmar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [progreso, setProgreso] = useState(0);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", tecla);
    };
  }, [onCerrar]);

  function alDesplazar() {
    const c = caja.current;
    if (!c) return;
    const max = c.scrollHeight - c.clientHeight;
    setProgreso(max > 0 ? Math.min(100, Math.round((c.scrollTop / max) * 100)) : 100);
  }

  function irA(n: number) {
    const el = caja.current?.querySelector<HTMLElement>(`#clausula-${n}`);
    if (el && caja.current) caja.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0912]" role="dialog" aria-modal="true" aria-label="Contrato">
      <div className="border-b border-white/10 bg-[#0f0c1a]">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">Contrato · {nombre}</p>
            <p className="text-xs text-white/40">{progreso}% leído</p>
          </div>
          <a href={`/api/contrato/${token}/pdf`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
            PDF
          </a>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20">
            ✕
          </button>
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full bg-[#8B5CF6] transition-[width]" style={{ width: `${progreso}%` }} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
          {CONTRATO_CLAUSULAS.map((c) => (
            <button key={c.n} type="button" onClick={() => irA(c.n)} title={c.titulo} className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-white/[0.07] px-2 text-xs font-bold text-white/70 hover:bg-[#8B5CF6]/30 hover:text-white">
              {c.n}
            </button>
          ))}
        </div>
      </div>

      <div ref={caja} onScroll={alDesplazar} className="relative min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <article className="mx-auto max-w-2xl space-y-7 text-[17px] leading-[1.75] text-white/85">
          <header className="space-y-2">
            <h2 className="font-display text-2xl font-semibold leading-snug text-white">{CONTRATO_TITULO}</h2>
            <p className="text-base text-white/60">
              Entre <b className="text-white/85">{CONTRATO_AGENCIA}</b> («la Agencia») y <b className="text-white/85">{nombre}</b> («la Creadora»). Fecha de inicio: {fechaLarga(fechaInicio)}.
            </p>
          </header>
          {CONTRATO_CLAUSULAS.map((c) => (
            <section key={c.n} id={`clausula-${c.n}`} className="space-y-3">
              <h3 className="font-display text-xl font-semibold text-white">
                {c.n}. {c.titulo}
              </h3>
              {c.bloques.map((b, i) =>
                b.tipo === "li" ? (
                  <p key={i} className="pl-5 before:-ml-5 before:mr-2.5 before:content-['•']">{b.texto}</p>
                ) : (
                  <p key={i}>
                    {b.negrita ? <b className="text-white">{b.negrita} </b> : null}
                    {b.texto}
                  </p>
                ),
              )}
            </section>
          ))}
          <div className="rounded-2xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 p-5 text-center">
            <p className="font-semibold text-white">¿Lo has leído todo?</p>
            <button type="button" onClick={onFirmar} className="btn-primary mt-3 min-h-12 w-full px-5 text-base">
              Continuar a firmar
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
