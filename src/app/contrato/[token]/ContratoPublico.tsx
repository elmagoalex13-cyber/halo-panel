"use client";

import { useRef, useState } from "react";
import { FirmaPad } from "@/components/FirmaPad";
import { CONTRATO_AGENCIA, CONTRATO_CLAUSULAS, CONTRATO_TITULO } from "@/lib/contratoTexto";
import { EXPLICACION_CLAUSULAS, PREGUNTAS_FRECUENTES, RESUMEN_ESENCIAL } from "@/lib/contratoExplicacion";
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
            Hemos recibido tu firma{firmadoAt ? ` el ${new Date(firmadoAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}` : ""}. Te hemos enviado una copia por email. En breve nos pondremos en contacto contigo para los siguientes pasos.
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
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-6 px-4 py-8 pb-24">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA]">Halo Models</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">Hola{nombrePila ? `, ${nombrePila}` : ""}, este es tu contrato</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/60">
          Lo hemos explicado en lenguaje sencillo, cláusula por cláusula, para que sepas exactamente qué firmas y por qué es así. Tómate tu tiempo: leerlo y firmarlo lleva unos 5 minutos. <b className="text-white/80">Si algo no lo entiendes, escríbenos antes de firmar.</b>
        </p>
      </header>

      <section aria-labelledby="esencial" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 id="esencial" className="font-display text-xl font-semibold text-white">Lo esencial, en 30 segundos</h2>
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

      <section aria-labelledby="clausulas">
        <h2 id="clausulas" className="font-display text-xl font-semibold text-white">Cláusula por cláusula</h2>
        <p className="mt-1 text-sm text-white/50">Toca cada una: verás qué dice «en claro», por qué está ahí y el texto exacto del contrato.</p>
        <div className="mt-3 space-y-2">
          {CONTRATO_CLAUSULAS.map((c) => {
            const e = EXPLICACION_CLAUSULAS.find((x) => x.n === c.n);
            return (
              <details key={c.n} className="group rounded-2xl border border-white/10 bg-white/[0.04]">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#8B5CF6]/25 text-sm font-bold text-[#C4B5FD]">{c.n}</span>
                  <span className="flex-1 font-semibold text-white">{c.titulo.charAt(0) + c.titulo.slice(1).toLowerCase()}</span>
                  <span className="text-white/40 transition group-open:rotate-180">▾</span>
                </summary>
                <div className="space-y-3 border-t border-white/10 px-4 py-4">
                  {e ? (
                    <>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300/80">En claro</p>
                        <p className="mt-1 text-[15px] leading-relaxed text-white/85">{e.claro}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">Por qué es así</p>
                        <p className="mt-1 text-[15px] leading-relaxed text-white/70">{e.porque}</p>
                      </div>
                    </>
                  ) : null}
                  <details className="rounded-xl bg-black/25">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-white/50 hover:text-white/80">Ver el texto exacto del contrato</summary>
                    <div className="space-y-2 px-3 pb-3 text-[13px] leading-relaxed text-white/60">
                      {c.bloques.map((b, i) =>
                        b.tipo === "li" ? (
                          <p key={i} className="pl-4 before:-ml-4 before:mr-2 before:content-['•']">{b.texto}</p>
                        ) : (
                          <p key={i}>
                            {b.negrita ? <b className="text-white/80">{b.negrita} </b> : null}
                            {b.texto}
                          </p>
                        ),
                      )}
                    </div>
                  </details>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="faq" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 id="faq" className="font-display text-xl font-semibold text-white">Preguntas que suelen surgir</h2>
        <div className="mt-3 space-y-3">
          {PREGUNTAS_FRECUENTES.map((f) => (
            <div key={f.p}>
              <p className="font-semibold text-white">{f.p}</p>
              <p className="text-sm leading-relaxed text-white/65">{f.r}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="font-display text-xl font-semibold text-white">Tu contrato</h2>
        <dl className="mt-3 space-y-1 text-sm text-white/70">
          <div className="flex justify-between gap-3"><dt className="text-white/40">Entre</dt><dd className="text-right">{CONTRATO_AGENCIA}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-white/40">y</dt><dd className="text-right font-semibold text-white">{nombre}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-white/40">Fecha de inicio</dt><dd className="text-right">{fechaLarga(fechaInicio)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-white/40">{CONTRATO_TITULO}</p>
        <a href={`/api/contrato/${token}/pdf`} className="btn-secondary mt-4 inline-flex min-h-11 items-center px-4 text-sm">
          Descargar el contrato completo (PDF)
        </a>
        <button type="button" onClick={() => zonaFirma.current?.scrollIntoView({ behavior: "smooth" })} className="ml-2 mt-4 inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[#A78BFA] hover:underline">
          Ir a firmar ↓
        </button>
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
            <span className="text-sm leading-relaxed text-white/80">He leído y entiendo el contrato completo y las explicaciones, soy mayor de edad y acepto sus condiciones.</span>
          </label>
          {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
          <button type="button" onClick={firmar} disabled={!puedeFirmar} className="btn-primary min-h-14 w-full text-base disabled:opacity-40">
            {enviando ? "Firmando…" : "Firmar contrato"}
          </button>
          <p className="text-center text-xs text-white/35">Recibirás una copia firmada en PDF en tu email.</p>
        </div>
        {firmaAgencia ? (
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 text-xs text-white/45">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={firmaAgencia} alt="Firma de la agencia" className="h-10 rounded bg-white px-2" />
            <span>Ya firmado por {CONTRATO_AGENCIA}.</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
