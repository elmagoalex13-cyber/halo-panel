import { randomBytes } from "node:crypto";
import { enviarEmail, type EmailAdjunto } from "@/lib/resend";
import { resumenEsencialDe } from "@/lib/contratoExplicacion";
import type { VarianteContrato } from "@/lib/contratoVariantes";
import { primerNombre } from "@/lib/leadsMensajes";
import { fechaLarga } from "@/lib/contratoPdf";

export type EstadoContrato = "enviado" | "visto" | "firmado" | "cancelado";

export type ContratoFila = {
  id: string;
  token: string;
  nombre: string;
  email: string;
  fecha_inicio: string;
  estado: EstadoContrato;
  enviado_por: string | null;
  enviado_at: string | null;
  email_error: string | null;
  visto_at: string | null;
  firmado_at: string | null;
  pdf_key: string | null;
  created_at: string;
  modelo_id?: string | null;
};

export const CAMPOS_LISTA = "id, token, nombre, email, fecha_inicio, estado, enviado_por, enviado_at, email_error, visto_at, firmado_at, pdf_key, created_at";

export const nuevoToken = () => randomBytes(24).toString("base64url");
export const enlaceContrato = (origen: string, token: string) => `${origen.replace(/\/$/, "")}/contrato/${token}`;
export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Email con el enlace al contrato y lo esencial explicado en dos minutos de lectura. */
export async function enviarEmailContrato(c: { nombre: string; email: string; fecha_inicio: string }, enlace: string, variante: VarianteContrato = "70-30") {
  const RESUMEN_ESENCIAL = resumenEsencialDe(variante); // el resumen lleva el MISMO reparto que el contrato que va a firmar
  const nombre = primerNombre(c.nombre) || "";
  const logo = (() => {
    try {
      return `${new URL(enlace).origin}/halo-logo.png`;
    } catch {
      return "";
    }
  })();
  const saludo = nombre ? `Hola, ${esc(nombre)}` : "Hola";
  const puntos = RESUMEN_ESENCIAL.map(
    (r) => `<tr><td style="padding:10px 0;vertical-align:top;width:34px;font-size:20px">${r.icono}</td><td style="padding:10px 0;vertical-align:top"><div style="font-weight:700;color:#1b1530;font-size:15px">${esc(r.titulo)}</div><div style="color:#4a4560;font-size:14px;line-height:1.5;margin-top:2px">${esc(r.texto)}</div></td></tr>`,
  ).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
 <div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #e6e1f5">
  ${logo ? `<img src="${esc(logo)}" width="72" height="72" alt="Halo Models Agency" style="display:block;border-radius:14px">` : `<div style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#7c4dff;text-transform:uppercase">Halo Models</div>`}
  <h1 style="margin:8px 0 12px;font-size:22px;line-height:1.3;color:#1b1530">${saludo}, este es tu contrato</h1>
  <p style="margin:0 0 14px;color:#4a4560;font-size:15px;line-height:1.6">Hemos recibido tu solicitud para aplicar como modelo y nos gustaría empezar a trabajar contigo. Te dejamos el contrato para que lo leas con calma. <b>Te dejamos lo esencial resumido</b> y el contrato completo debajo, para que sepas exactamente qué firmas. Leerlo y firmarlo te lleva unos minutos.</p>
  <p style="margin:0 0 6px;color:#1b1530;font-size:15px;font-weight:700">Lo esencial:</p>
  <table role="presentation" style="width:100%;border-collapse:collapse">${puntos}</table>
  <div style="text-align:center;margin:26px 0 8px"><a href="${esc(enlace)}" style="display:inline-block;background:#7c4dff;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px">Leer y firmar mi contrato</a></div>
  <p style="margin:10px 0 0;color:#7a7592;font-size:13px;text-align:center">Fecha de firma: ${esc(fechaLarga(c.fecha_inicio))}. Si el botón no funciona, copia este enlace:<br><span style="word-break:break-all">${esc(enlace)}</span></p>
 </div>
 <p style="color:#7a7592;font-size:13px;line-height:1.5;text-align:center;margin:16px 8px 0">¿Dudas? Respóndenos a este email antes de firmar y te contestamos encantados. Es importante que lo entiendas todo.</p>
</div></body></html>`;
  const text = `${saludo}, este es tu contrato con Halo Models.\n\nLéelo con calma y fírmalo aquí:\n${enlace}\n\nLo esencial:\n${RESUMEN_ESENCIAL.map((r) => `- ${r.titulo}: ${r.texto}`).join("\n")}\n\n¿Dudas? Responde a este email antes de firmar.`;
  return enviarEmail({ to: c.email, subject: `${nombre ? `${nombre}, t` : "T"}u contrato con Halo Models`, html, text });
}

/** Copia del contrato firmado (PDF adjunto) para la modelo y, si esta configurado, para la agencia (CCO). */
export async function enviarCopiaFirmada(c: { nombre: string; email: string }, pdf: Uint8Array, opts: { sinCopiaAgencia?: boolean } = {}) {
  const nombre = primerNombre(c.nombre);
  const adjunto: EmailAdjunto = { filename: "Contrato-Halo-Models.pdf", content: Buffer.from(pdf).toString("base64") };
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #e6e1f5">
<h1 style="margin:0 0 12px;font-size:21px;color:#1b1530">¡Gracias${nombre ? `, ${esc(nombre)}` : ""}! Contrato firmado ✅</h1>
<p style="margin:0 0 12px;color:#4a4560;font-size:15px;line-height:1.6">Hemos recibido tu firma. Te adjuntamos una copia del contrato firmado en PDF: guárdala por si la necesitas.</p>
<p style="margin:0;color:#4a4560;font-size:15px;line-height:1.6">En breve nos pondremos en contacto contigo para los siguientes pasos. Si tienes cualquier duda, responde a este email.</p></div></div></body></html>`;
  return enviarEmail({ to: c.email, subject: "Tu contrato firmado con Halo Models", html, text: "Gracias. Adjuntamos una copia del contrato firmado.", adjuntos: [adjunto], bcc: opts.sinCopiaAgencia ? undefined : process.env.CONTRATOS_COPIA_EMAIL || undefined });
}

/** Avisos del dashboard: contratos firmados esta semana y contratos enviados que llevan 3 dias o mas sin firmar (para recordarselo). */
export async function avisosContratos(): Promise<Array<{ id: string; nivel: "verde" | "amarillo"; texto: string; href: string }>> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const { data: bruto } = await createAdminClient().from("contratos_modelos").select("token, nombre, estado, created_at, firmado_at").in("estado", ["enviado", "visto", "firmado"]).order("created_at", { ascending: false }).limit(200);
    // Los contratos privados (solo del dueño) no salen en los avisos del socio
    const { sesionPanelActual } = await import("@/lib/panelUsuarios");
    const { tokensPrivados } = await import("@/lib/contratoAmbito");
    const dueno = Boolean((await sesionPanelActual())?.dueno);
    const privados = dueno ? new Set<string>() : await tokensPrivados((bruto ?? []).map((c) => c.token as string));
    const data = (bruto ?? []).filter((c) => !privados.has(c.token as string));
    const ahora = Date.now();
    const filas = (data ?? []) as Array<{ nombre: string; estado: EstadoContrato; created_at: string; firmado_at: string | null }>;
    const firmados = filas.filter((c) => c.estado === "firmado" && c.firmado_at && ahora - new Date(c.firmado_at).getTime() < 7 * 86400000);
    const sinFirmar = filas.filter((c) => c.estado !== "firmado" && ahora - new Date(c.created_at).getTime() >= 3 * 86400000);
    const avisos: Array<{ id: string; nivel: "verde" | "amarillo"; texto: string; href: string }> = [];
    if (firmados.length) {
      const nombres = firmados.map((c) => c.nombre).sort();
      avisos.push({ id: `contrato-firmado|${nombres.join(",")}`, nivel: "verde", texto: `Contrato firmado: ${nombres.join(", ")}`, href: "/contratos" });
    }
    if (sinFirmar.length) {
      const nombres = sinFirmar.map((c) => c.nombre).sort();
      avisos.push({ id: `contrato-pendiente|${nombres.join(",")}`, nivel: "amarillo", texto: `Contratos sin firmar desde hace 3 días o más: ${nombres.join(", ")}. Recuérdaselo o elimínalo`, href: "/contratos" });
    }
    return avisos;
  } catch {
    return [];
  }
}

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** ¿El nombre del contrato corresponde a esa modelo? Iguales, o todas las palabras de uno estan en el otro (Rachel / Rachel Sweet). */
export function mismoNombre(a: string, b: string) {
  const x = normalizar(a).split(" ").filter(Boolean);
  const y = normalizar(b).split(" ").filter(Boolean);
  if (!x.length || !y.length) return false;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.every((p) => largo.includes(p));
}

/**
 * Liga a su modelo los contratos firmados que aun no lo estan, cuando el nombre coincide con UNA sola modelo (si hay duda no toca nada:
 * se elige a mano). Devuelve los ids ligados. Si falta el SQL de modelo_id no hace nada.
 */
export async function ligarContratosAutomatico(): Promise<number> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const db = createAdminClient();
    const [{ data: sueltos, error }, { data: modelos }] = await Promise.all([
      db.from("contratos_modelos").select("id, nombre").is("modelo_id", null).eq("estado", "firmado"),
      db.from("modelos").select("id, nombre").is("eliminada_at", null),
    ]);
    if (error || !sueltos?.length || !modelos?.length) return 0;
    let n = 0;
    for (const c of sueltos) {
      const candidatas = modelos.filter((m) => mismoNombre(c.nombre as string, m.nombre as string));
      if (candidatas.length !== 1) continue;
      const { error: e } = await db.from("contratos_modelos").update({ modelo_id: candidatas[0].id }).eq("id", c.id).is("modelo_id", null);
      if (!e) n++;
    }
    return n;
  } catch {
    return 0;
  }
}
