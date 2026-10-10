"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { FirmaPad } from "@/components/FirmaPad";

type Contrato = {
  id: string;
  nombre: string;
  email: string;
  fecha_inicio: string;
  estado: "enviado" | "visto" | "firmado" | "cancelado";
  enviado_por: string | null;
  enviado_at: string | null;
  email_error: string | null;
  visto_at: string | null;
  firmado_at: string | null;
  created_at: string;
  enlace: string;
};

const ESTADO: Record<Contrato["estado"], { texto: string; clase: string }> = {
  enviado: { texto: "Enviado", clase: "bg-sky-400/15 text-sky-200" },
  visto: { texto: "Lo ha abierto", clase: "bg-amber-300/15 text-amber-100" },
  firmado: { texto: "Firmado ✅", clase: "bg-emerald-400/20 text-emerald-200" },
  cancelado: { texto: "Cancelado", clase: "bg-white/10 text-white/40" },
};

/** Mensaje para mandar el enlace por WhatsApp (se puede copiar o abrir directamente si se puso el telefono). */
const mensajeWhatsApp = (nombre: string, enlace: string) => {
  const n = nombre.trim().split(/\s+/)[0] ?? "";
  const pila = n ? n.charAt(0).toLocaleUpperCase("es-ES") + n.slice(1) : "";
  return `Hola${pila ? `, ${pila}` : ""}. Te enviamos tu contrato con Halo Models. Léelo con calma y fírmalo desde el móvil en este enlace:\n\n${enlace}\n\nSi tienes cualquier duda, escríbenos antes de firmar.`;
};

const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); // YYYY-MM-DD
const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "");

/** Contratos para modelos nuevas, sin crearles el portal: se rellena nombre, email y fecha, se pone la firma y sale por email con la explicacion. */
export function EnviarContrato() {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Contrato[]>([]);
  const [resend, setResend] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [firmaGuardada, setFirmaGuardada] = useState<string | null>(null);
  const [cambiandoFirma, setCambiandoFirma] = useState(false);
  const [firmaNueva, setFirmaNueva] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string; enlace?: string; nombre?: string; telefono?: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, f] = await Promise.all([fetch("/api/contratos", { cache: "no-store" }), fetch("/api/contratos/firma", { cache: "no-store" })]);
    const j = (await c.json().catch(() => ({}))) as { contratos?: Contrato[]; resend?: boolean; sinTabla?: boolean };
    setSinTabla(Boolean(j.sinTabla));
    setResend(j.resend !== false);
    setLista(j.contratos ?? []);
    const jf = (await f.json().catch(() => ({}))) as { firma?: string | null };
    setFirmaGuardada(jf.firma ?? null);
  }, []);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const firmaLista = firmaNueva ?? firmaGuardada;
  const puede = nombre.trim().length >= 2 && (!email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) && Boolean(fecha) && Boolean(firmaLista) && !enviando;

  async function enviar() {
    setEnviando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, email, fecha_inicio: fecha, firma_agencia: firmaNueva ?? undefined }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; enlace?: string; email?: { enviado: boolean; error?: string; sinConfigurar?: boolean; omitido?: boolean } };
      if (!res.ok) throw new Error(j.error ?? "No se pudo crear el contrato");
      if (firmaNueva) {
        await fetch("/api/contratos/firma", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firma: firmaNueva }) }).catch(() => undefined);
        setFirmaGuardada(firmaNueva);
        setFirmaNueva(null);
        setCambiandoFirma(false);
      }
      const datosMsg = { enlace: j.enlace, nombre: nombre.trim(), telefono: telefono.replace(/\D/g, "") };
      if (j.email?.enviado) setMsg({ ok: true, texto: `Contrato creado y enviado por email a ${email.trim()}. Aquí tienes también el enlace por si quieres mandarlo por WhatsApp.`, ...datosMsg });
      else if (j.email?.omitido || j.email?.sinConfigurar) setMsg({ ok: true, texto: "Contrato creado. Mándale el enlace por WhatsApp (copia el mensaje de abajo).", ...datosMsg });
      else setMsg({ ok: false, texto: `Contrato creado, pero el email NO ha salido: ${j.email?.error ?? "error desconocido"}. Mándale el enlace por WhatsApp.`, ...datosMsg });
      setNombre("");
      setEmail("");
      setTelefono("");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Error" });
    } finally {
      setEnviando(false);
    }
  }

  async function accion(c: Contrato, a: "reenviar" | "cancelar") {
    if (a === "cancelar" && !confirm(`¿Cancelar el contrato de ${c.nombre}? Su enlace dejará de funcionar.`)) return;
    const res = await fetch(`/api/contratos/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: a }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setMsg(res.ok ? { ok: true, texto: a === "reenviar" ? `Reenviado a ${c.email}.` : "Contrato cancelado." } : { ok: false, texto: j.error ?? "No se pudo" });
    await cargar();
  }

  function copiar(c: Contrato) {
    void navigator.clipboard.writeText(mensajeWhatsApp(c.nombre, c.enlace));
    setCopiado(c.id);
    setTimeout(() => setCopiado(null), 1800);
  }

  const pendientes = lista.filter((c) => c.estado === "enviado" || c.estado === "visto").length;

  return (
    <GlassCard className="mb-6 p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            📝 Contratos para modelos nuevas {pendientes ? <span className="ml-2 rounded-full bg-amber-300/20 px-2 py-0.5 text-xs font-bold text-amber-100">{pendientes} sin firmar</span> : null}
          </h2>
          <p className="text-sm text-white/45">Envía el contrato por email sin crearles el portal: lo leen explicado en sencillo y lo firman desde el móvil.</p>
        </div>
        <span className="text-white/50">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto ? (
        <div className="mt-5 space-y-5">
          {sinTabla ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Falta ejecutar el SQL <code>20261024_contratos_modelos.sql</code> en Supabase.</p> : null}
          {!resend ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/60">
              Se envían por <b className="text-white/80">enlace</b>: al crear el contrato te damos el enlace y un mensaje listo para mandarlo por WhatsApp. (El email automático se puede activar más adelante.)
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Nombre de la modelo</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" className="input-base w-full" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">{resend ? "Email" : "Email (opcional)"}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ella@email.com" className="input-base w-full" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Fecha de inicio</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input-base w-full" />
            </label>
          </div>

          <label className="block max-w-xs space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">WhatsApp de la modelo (opcional)</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="34600123456 (con prefijo)" className="input-base w-full" />
            <span className="block text-[11px] text-white/30">Solo sirve para abrir el chat con el mensaje ya escrito; no se guarda.</span>
          </label>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Firma de la agencia</p>
            {firmaGuardada && !cambiandoFirma ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={firmaGuardada} alt="Firma guardada" className="h-14 rounded-lg bg-white px-3" />
                <button type="button" onClick={() => setCambiandoFirma(true)} className="text-xs font-semibold text-[#A78BFA] hover:underline">
                  Cambiar firma
                </button>
                <span className="text-xs text-white/35">Guardada: se usa en todos los contratos.</span>
              </div>
            ) : (
              <div className="mt-1.5 max-w-md">
                <FirmaPad onChange={setFirmaNueva} alto={120} />
                {firmaGuardada ? (
                  <button type="button" onClick={() => { setCambiandoFirma(false); setFirmaNueva(null); }} className="mt-1 text-xs text-white/40 hover:text-white hover:underline">
                    Dejar la que había
                  </button>
                ) : (
                  <p className="mt-1 text-[11px] text-white/35">Se guarda al enviar el primer contrato y se reutiliza.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={enviar} disabled={!puede} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">
              {enviando ? "Creando…" : resend && email.trim() ? "Crear y enviar contrato" : "Crear contrato"}
            </button>
            {msg && !msg.enlace ? <span className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.texto}</span> : null}
          </div>

          {msg?.enlace ? (
            <div className={`space-y-3 rounded-xl border p-4 ${msg.ok ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-amber-400/30 bg-amber-400/[0.06]"}`}>
              <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-200" : "text-amber-100"}`}>{msg.texto}</p>
              <p className="whitespace-pre-line rounded-lg bg-black/25 px-3 py-2 text-xs leading-relaxed text-white/70">{mensajeWhatsApp(msg.nombre ?? "", msg.enlace)}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { void navigator.clipboard.writeText(mensajeWhatsApp(msg.nombre ?? "", msg.enlace!)); setCopiado("nuevo"); setTimeout(() => setCopiado(null), 1800); }} className="btn-primary px-4 py-2 text-xs">
                  {copiado === "nuevo" ? "✓ Mensaje copiado" : "Copiar mensaje con el enlace"}
                </button>
                {msg.telefono ? (
                  <a href={`https://wa.me/${msg.telefono}?text=${encodeURIComponent(mensajeWhatsApp(msg.nombre ?? "", msg.enlace))}`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400">
                    Abrir WhatsApp
                  </a>
                ) : null}
                <button type="button" onClick={() => { void navigator.clipboard.writeText(msg.enlace!); setCopiado("solo"); setTimeout(() => setCopiado(null), 1800); }} className="btn-secondary px-3 py-2 text-xs">
                  {copiado === "solo" ? "✓ Copiado" : "Solo el enlace"}
                </button>
              </div>
            </div>
          ) : null}

          {lista.length ? (
            <div className="border-t border-white/[0.08] pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Contratos enviados</p>
              <ul className="space-y-2">
                {lista.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-sm">
                    <span className="font-semibold text-white">{c.nombre}</span>
                    <span className="text-xs text-white/40">{c.email || "sin email (por enlace)"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO[c.estado].clase}`}>{ESTADO[c.estado].texto}</span>
                    <span className="text-xs text-white/35">
                      {c.firmado_at ? `firmado ${cuando(c.firmado_at)}` : c.visto_at ? `abierto ${cuando(c.visto_at)}` : c.enviado_at ? `enviado ${cuando(c.enviado_at)}` : "enlace creado"}
                      {c.enviado_por ? ` · ${c.enviado_por}` : ""}
                    </span>
                    {c.email_error && c.estado !== "firmado" ? <span className="w-full text-[11px] text-red-300/80">Email: {c.email_error}</span> : null}
                    <span className="ml-auto flex flex-wrap gap-2 text-xs">
                      <a href={`/api/contratos/${c.id}/pdf`} target="_blank" rel="noreferrer" className="font-semibold text-[#A78BFA] hover:underline">
                        PDF
                      </a>
                      {c.estado !== "firmado" && c.estado !== "cancelado" ? (
                        <>
                          <button onClick={() => copiar(c)} className="font-semibold text-white/60 hover:text-white hover:underline">
                            {copiado === c.id ? "✓ Copiado" : "Copiar mensaje"}
                          </button>
                          {c.email && resend ? (
                            <button onClick={() => void accion(c, "reenviar")} className="font-semibold text-white/60 hover:text-white hover:underline">
                              Reenviar email
                            </button>
                          ) : null}
                          <button onClick={() => void accion(c, "cancelar")} className="font-semibold text-red-300/70 hover:text-red-300 hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
