/**
 * Envía un mensaje de Telegram al chat del admin.
 * @param {string} text - Mensaje en formato Markdown
 */
export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_CHAT_ID no configurados — notificación omitida");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[telegram] Error al enviar mensaje:", body);
    }
  } catch (err) {
    console.error("[telegram] Error de red:", err.message);
  }
}

/**
 * Notifica al admin cuando una pieza ha sido editada y está lista para aprobar.
 * @param {{ titulo: string, tipo: string, modelo: string }} info
 */
export async function notificarPiezaLista(info) {
  const tipo = info.tipo ?? "desconocido";
  const modelo = info.modelo ?? "—";
  const titulo = info.titulo ?? "Sin título";
  await sendTelegram(
    `✅ *Pieza lista para aprobación*\n\n` +
    `📹 *${titulo}*\n` +
    `👤 Modelo: ${modelo}\n` +
    `🎬 Tipo: ${tipo}\n\n` +
    `Revísala en la Mesa de Aprobación.`
  );
}

/**
 * Notifica al admin cuando un trial reel está listo para aprobación.
 * @param {{ cuenta: string, modelo: string, usos: number }} info
 */
export async function notificarTrialListo(info) {
  await sendTelegram(
    `🔄 *Trial Reel listo para aprobación*\n\n` +
    `📱 Cuenta: @${info.cuenta ?? "—"}\n` +
    `👤 Modelo: ${info.modelo ?? "—"}\n` +
    `🔁 Usos anteriores: ${info.usos ?? 0}\n\n` +
    `Apruébalo en la sección _Trial Reels_ de la Mesa de Aprobación.`
  );
}

/**
 * Notifica al admin de un error crítico en el runner.
 * @param {string} context - Contexto donde ocurrió el error
 * @param {Error|string} err
 */
export async function notificarError(context, err) {
  const msg = err instanceof Error ? err.message : String(err);
  await sendTelegram(
    `❌ *Error en el runner*\n\n` +
    `📍 Contexto: ${context}\n` +
    `💬 ${msg}`
  );
}
