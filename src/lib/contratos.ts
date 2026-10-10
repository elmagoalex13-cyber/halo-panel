import { randomBytes } from "node:crypto";
import { enviarEmail, type EmailAdjunto } from "@/lib/resend";
import { RESUMEN_ESENCIAL } from "@/lib/contratoExplicacion";
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
};

export const CAMPOS_LISTA = "id, token, nombre, email, fecha_inicio, estado, enviado_por, enviado_at, email_error, visto_at, firmado_at, pdf_key, created_at";

export const nuevoToken = () => randomBytes(24).toString("base64url");
export const enlaceContrato = (origen: string, token: string) => `${origen.replace(/\/$/, "")}/contrato/${token}`;
export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Email con el enlace al contrato y lo esencial explicado en dos minutos de lectura. */
export async function enviarEmailContrato(c: { nombre: string; email: string; fecha_inicio: string }, enlace: string) {
  const nombre = primerNombre(c.nombre) || "";
  const saludo = nombre ? `Hola, ${esc(nombre)}` : "Hola";
  const puntos = RESUMEN_ESENCIAL.map(
    (r) => `<tr><td style="padding:10px 0;vertical-align:top;width:34px;font-size:20px">${r.icono}</td><td style="padding:10px 0;vertical-align:top"><div style="font-weight:700;color:#1b1530;font-size:15px">${esc(r.titulo)}</div><div style="color:#4a4560;font-size:14px;line-height:1.5;margin-top:2px">${esc(r.texto)}</div></td></tr>`,
  ).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
 <div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #e6e1f5">
  <div style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#7c4dff;text-transform:uppercase">Halo Models</div>
  <h1 style="margin:8px 0 12px;font-size:22px;line-height:1.3;color:#1b1530">${saludo}, este es tu contrato</h1>
  <p style="margin:0 0 14px;color:#4a4560;font-size:15px;line-height:1.6">Hemos recibido tu solicitud para aplicar como modelo y nos gustaría empezar a trabajar contigo. Te dejamos el contrato para que lo leas con calma. <b>Lo hemos explicado en lenguaje sencillo, cláusula por cláusula</b>, para que sepas exactamente qué firmas y por qué es así. Leerlo y firmarlo te lleva unos 5 minutos.</p>
  <p style="margin:0 0 6px;color:#1b1530;font-size:15px;font-weight:700">Lo esencial, en 30 segundos:</p>
  <table role="presentation" style="width:100%;border-collapse:collapse">${puntos}</table>
  <div style="text-align:center;margin:26px 0 8px"><a href="${esc(enlace)}" style="display:inline-block;background:#7c4dff;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px">Leer y firmar mi contrato</a></div>
  <p style="margin:10px 0 0;color:#7a7592;font-size:13px;text-align:center">Fecha de inicio: ${esc(fechaLarga(c.fecha_inicio))}. Si el botón no funciona, copia este enlace:<br><span style="word-break:break-all">${esc(enlace)}</span></p>
 </div>
 <p style="color:#7a7592;font-size:13px;line-height:1.5;text-align:center;margin:16px 8px 0">¿Dudas? Respóndenos a este email antes de firmar y te contestamos encantados. Es importante que lo entiendas todo.</p>
</div></body></html>`;
  const text = `${saludo}, este es tu contrato con Halo Models.\n\nLéelo con calma (lo hemos explicado en lenguaje sencillo) y fírmalo aquí:\n${enlace}\n\nLo esencial:\n${RESUMEN_ESENCIAL.map((r) => `- ${r.titulo}: ${r.texto}`).join("\n")}\n\n¿Dudas? Responde a este email antes de firmar.`;
  return enviarEmail({ to: c.email, subject: `${nombre ? `${nombre}, t` : "T"}u contrato con Halo Models`, html, text });
}

/** Copia del contrato firmado (PDF adjunto) para la modelo y, si esta configurado, para la agencia (CCO). */
export async function enviarCopiaFirmada(c: { nombre: string; email: string }, pdf: Uint8Array) {
  const nombre = primerNombre(c.nombre);
  const adjunto: EmailAdjunto = { filename: "Contrato-Halo-Models.pdf", content: Buffer.from(pdf).toString("base64") };
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #e6e1f5">
<h1 style="margin:0 0 12px;font-size:21px;color:#1b1530">¡Gracias${nombre ? `, ${esc(nombre)}` : ""}! Contrato firmado ✅</h1>
<p style="margin:0 0 12px;color:#4a4560;font-size:15px;line-height:1.6">Hemos recibido tu firma. Te adjuntamos una copia del contrato firmado en PDF: guárdala por si la necesitas.</p>
<p style="margin:0;color:#4a4560;font-size:15px;line-height:1.6">En breve nos pondremos en contacto contigo para los siguientes pasos. Si tienes cualquier duda, responde a este email.</p></div></div></body></html>`;
  return enviarEmail({ to: c.email, subject: "Tu contrato firmado con Halo Models", html, text: "Gracias. Adjuntamos una copia del contrato firmado.", adjuntos: [adjunto], bcc: process.env.CONTRATOS_COPIA_EMAIL || undefined });
}

/** Avisos del dashboard: contratos firmados esta semana y contratos enviados que llevan 3 dias o mas sin firmar (para recordarselo). */
export async function avisosContratos(): Promise<Array<{ id: string; nivel: "verde" | "amarillo"; texto: string; href: string }>> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const { data } = await createAdminClient().from("contratos").select("nombre, estado, created_at, firmado_at").in("estado", ["enviado", "visto", "firmado"]).order("created_at", { ascending: false }).limit(200);
    const ahora = Date.now();
    const filas = (data ?? []) as Array<{ nombre: string; estado: EstadoContrato; created_at: string; firmado_at: string | null }>;
    const firmados = filas.filter((c) => c.estado === "firmado" && c.firmado_at && ahora - new Date(c.firmado_at).getTime() < 7 * 86400000);
    const sinFirmar = filas.filter((c) => c.estado !== "firmado" && ahora - new Date(c.created_at).getTime() >= 3 * 86400000);
    const avisos: Array<{ id: string; nivel: "verde" | "amarillo"; texto: string; href: string }> = [];
    if (firmados.length) {
      const nombres = firmados.map((c) => c.nombre).sort();
      avisos.push({ id: `contrato-firmado|${nombres.join(",")}`, nivel: "verde", texto: `Contrato firmado: ${nombres.join(", ")}`, href: "/dashboard" });
    }
    if (sinFirmar.length) {
      const nombres = sinFirmar.map((c) => c.nombre).sort();
      avisos.push({ id: `contrato-pendiente|${nombres.join(",")}`, nivel: "amarillo", texto: `Contratos sin firmar desde hace 3 días o más: ${nombres.join(", ")}. Recuérdaselo o reenvíaselo`, href: "/dashboard" });
    }
    return avisos;
  } catch {
    return [];
  }
}
