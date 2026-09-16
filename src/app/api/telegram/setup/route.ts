import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN no configurado en .env.local" }, { status: 400 });
  }

  const { webhookUrl } = await req.json() as { webhookUrl?: string };
  const url = webhookUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/telegram/webhook`;

  if (!url.startsWith("https://")) {
    return NextResponse.json({ error: "La URL del webhook debe ser HTTPS" }, { status: 400 });
  }

  const body: Record<string, unknown> = { url };
  if (WEBHOOK_SECRET) body.secret_token = WEBHOOK_SECRET;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  // Also set bot commands
  if (json.ok) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Ver tu ID de Telegram para vincular la cuenta" },
          { command: "vincular", description: "Obtener tu ID para vincularte" },
        ],
      }),
    });
  }

  return NextResponse.json(json);
}

export async function GET() {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN no configurado" }, { status: 400 });
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
  const json = await res.json();
  return NextResponse.json(json);
}
