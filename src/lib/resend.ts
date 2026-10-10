import nodemailer from "nodemailer";

// Envio de emails del panel (contratos). Dos formas, la primera que este configurada:
//
//  A) GMAIL de la agencia (sin dominio propio). En Vercel > Settings > Environment Variables:
//       SMTP_USER          el Gmail de la agencia, p. ej. halomodels.agencia@gmail.com
//       SMTP_APP_PASSWORD  contrasena de APLICACION de ese Gmail (16 letras; no es la contrasena normal)
//       SMTP_FROM_NAME     (opcional) nombre que ve la modelo, p. ej. "Halo Models"
//     Las respuestas de las modelos llegan a ese Gmail.
//
//  B) RESEND (cuando haya dominio propio verificado):
//       RESEND_API_KEY, RESEND_FROM  p. ej.  Halo Models <contratos@tudominio.com>
//       RESEND_REPLY_TO (opcional)
//
//  CONTRATOS_COPIA_EMAIL (opcional): recibe copia (CCO) de cada contrato firmado.
// Sin ninguna de las dos no se rompe nada: el panel avisa y deja copiar el enlace para mandarlo a mano.

const smtpConfigurado = () => Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
const resendListo = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

export const emailConfigurado = () => smtpConfigurado() || resendListo();
/** Que sistema se usara para enviar (para mostrarlo en el panel). */
export const sistemaEmail = (): "gmail" | "resend" | null => (smtpConfigurado() ? "gmail" : resendListo() ? "resend" : null);

export type EmailAdjunto = { filename: string; content: string }; // content en base64
type Resultado = { ok: true; id: string | null } | { ok: false; error: string; sinConfigurar?: boolean };

async function porGmail(p: { to: string; subject: string; html: string; text?: string; adjuntos?: EmailAdjunto[]; bcc?: string }): Promise<Resultado> {
  const user = process.env.SMTP_USER as string;
  try {
    const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: (process.env.SMTP_APP_PASSWORD as string).replace(/\s+/g, "") } });
    const info = await transporte.sendMail({
      from: `"${(process.env.SMTP_FROM_NAME || "Halo Models").replace(/"/g, "")}" <${user}>`,
      to: p.to,
      bcc: p.bcc,
      subject: p.subject,
      html: p.html,
      text: p.text,
      attachments: p.adjuntos?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64"), contentType: "application/pdf" })),
    });
    return { ok: true, id: info.messageId ?? null };
  } catch (e) {
    const m = e instanceof Error ? e.message : "No se pudo enviar con Gmail";
    return { ok: false, error: /Invalid login|Username and Password|535/i.test(m) ? "Gmail no acepta el usuario o la contraseña de aplicación: revisa SMTP_USER y SMTP_APP_PASSWORD en Vercel." : m };
  }
}

async function porResend(p: { to: string; subject: string; html: string; text?: string; adjuntos?: EmailAdjunto[]; bcc?: string }): Promise<Resultado> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [p.to],
        subject: p.subject,
        html: p.html,
        text: p.text,
        ...(process.env.RESEND_REPLY_TO ? { reply_to: process.env.RESEND_REPLY_TO } : {}),
        ...(p.bcc ? { bcc: [p.bcc] } : {}),
        ...(p.adjuntos?.length ? { attachments: p.adjuntos } : {}),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: j.message ?? `Resend respondió ${res.status}` };
    return { ok: true, id: j.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo conectar con Resend" };
  }
}

export async function enviarEmail(p: { to: string; subject: string; html: string; text?: string; adjuntos?: EmailAdjunto[]; bcc?: string }): Promise<Resultado> {
  if (smtpConfigurado()) return porGmail(p);
  if (resendListo()) return porResend(p);
  return { ok: false, sinConfigurar: true, error: "Falta configurar el email (SMTP_USER y SMTP_APP_PASSWORD del Gmail de la agencia, en Vercel)." };
}
