// Envio de emails con Resend (https://resend.com). Necesita en Vercel (Settings > Environment Variables):
//   RESEND_API_KEY  la clave de Resend (empieza por re_...)
//   RESEND_FROM     remitente con un dominio verificado en Resend, p. ej.  Halo Models <contratos@tudominio.com>
//   RESEND_REPLY_TO (opcional) a donde llegan las respuestas de las modelos
//   CONTRATOS_COPIA_EMAIL (opcional) recibe copia (CCO) de cada contrato firmado
// Sin la clave no se rompe nada: el panel avisa de que falta y deja copiar el enlace para mandarlo a mano.

export const resendConfigurado = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

export type EmailAdjunto = { filename: string; content: string }; // content en base64

export async function enviarEmail(p: { to: string; subject: string; html: string; text?: string; adjuntos?: EmailAdjunto[]; bcc?: string }): Promise<{ ok: true; id: string | null } | { ok: false; error: string; sinConfigurar?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return { ok: false, sinConfigurar: true, error: "Falta configurar Resend (RESEND_API_KEY y RESEND_FROM en Vercel)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [p.to],
        subject: p.subject,
        html: p.html,
        text: p.text,
        ...(process.env.RESEND_REPLY_TO ? { reply_to: process.env.RESEND_REPLY_TO } : {}),
        ...(p.bcc ? { bcc: [p.bcc] } : {}),
        ...(p.adjuntos?.length ? { attachments: p.adjuntos } : {}),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, error: j.message ?? `Resend respondió ${res.status}` };
    return { ok: true, id: j.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo conectar con Resend" };
  }
}
