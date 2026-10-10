"use client";

import { useRef, useState } from "react";
import { FirmaPad } from "@/components/FirmaPad";
import { CONTRATO_AGENCIA } from "@/lib/contratoTexto";
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
  const nombrePila = primerNombre(nombre);

  // Descarga de verdad (sin abrir el PDF): se baja el archivo y se guarda; si algo falla, el enlace normal tambien fuerza la descarga
  async function descargar(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const url = `/api/contrato/${token}/pdf?descargar=1`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("no");
      const objeto = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = objeto;
      a.download = "Contrato-Halo-Models.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objeto), 5000);
    } catch {
      window.location.href = url;
    }
  }

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
          <a href={`/api/contrato/${token}/pdf?descargar=1`} download="Contrato-Halo-Models.pdf" onClick={descargar} className="btn-primary mt-6 inline-flex min-h-12 items-center justify-center px-6 text-base">
            ⬇ Descargar mi contrato firmado (PDF)
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
          <a href={`/api/contrato/${token}/pdf?ver=1`} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-4 text-base">
            📖 Leer el contrato
          </a>
          <a href={`/api/contrato/${token}/pdf?descargar=1`} download="Contrato-Halo-Models.pdf" onClick={descargar} className="btn-secondary inline-flex min-h-12 items-center justify-center px-4 text-base">
            ⬇ Descargar PDF
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">«Leer» lo abre en una pestaña nueva; cuando termines, vuelve aquí para firmar.</p>
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

    </main>
  );
}
