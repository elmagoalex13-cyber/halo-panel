import { NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

async function getFileUrl(fileId: string): Promise<string | null> {
  if (!BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const json = await res.json() as { ok: boolean; result?: { file_path: string } };
  if (!json.ok || !json.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${json.result.file_path}`;
}

async function sendMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function POST(request: Request) {
  // Validate secret
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json() as {
    message?: {
      chat?: { id: number };
      from?: { id: number; first_name?: string };
      text?: string;
      video?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number; duration?: number };
      document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
      caption?: string;
    };
  };

  const msg = payload?.message;
  if (!msg) return NextResponse.json({ ok: true });

  const chatId = msg.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  // Handle /start or /vincular command
  if (msg.text?.startsWith("/start") || msg.text?.startsWith("/vincular")) {
    await sendMessage(chatId, `👋 <b>Hola!</b>\n\nTu ID de Telegram es: <code>${chatId}</code>\n\nComparte este número con tu manager para vincular tu cuenta. Una vez vinculada, podrás enviar vídeos directamente por aquí.`);
    return NextResponse.json({ ok: true });
  }

  if (!canUseSupabase()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const supabase = createAdminClient();

  // Find model by telegram_id
  const { data: modelo } = await supabase
    .from("modelos")
    .select("id, nombre")
    .eq("telegram_id", String(chatId))
    .maybeSingle();

  if (!modelo?.id) {
    await sendMessage(chatId, `❌ Tu cuenta de Telegram no está vinculada a ninguna modelo.\n\nTu ID es: <code>${chatId}</code>\nCompártelo con tu manager.`);
    return NextResponse.json({ ok: true });
  }

  // Check for video or document
  const videoInfo = msg.video ?? (msg.document?.mime_type?.startsWith("video/") ? msg.document : null);
  if (!videoInfo) {
    // Non-video message - just confirm
    if (msg.text) {
      await sendMessage(chatId, `Hola ${modelo.nombre} 👋 Envíame tus vídeos directamente por aquí.`);
    }
    return NextResponse.json({ ok: true });
  }

  // Notify receipt
  await sendMessage(chatId, `📥 Recibiendo vídeo... Por favor espera.`);

  try {
    const fileUrl = await getFileUrl(videoInfo.file_id);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = videoInfo.file_name ?? `${videoInfo.file_id}.mp4`;
    const r2Key = `bruto/${modelo.id}/${dateStr}/${Date.now()}_${fileName}`;

    if (fileUrl && BOT_TOKEN) {
      // Download from Telegram and upload to R2
      const downloadRes = await fetch(fileUrl);
      if (downloadRes.ok) {
        const buffer = Buffer.from(await downloadRes.arrayBuffer());
        await uploadToR2(r2Key, buffer, videoInfo.mime_type ?? "video/mp4");
      }
    }

    // Get caption for caption/frase if provided
    const captionText = msg.caption ?? null;

    // Create library_content entry
    const { data: content, error } = await supabase
      .from("library_content")
      .insert({
        modelo_id: modelo.id,
        origen: "telegram",
        r2_key: r2Key,
        r2_key_original: r2Key,
        filename_original: fileName,
        mimetype: videoInfo.mime_type ?? "video/mp4",
        size_bytes: videoInfo.file_size ?? 0,
        duracion_seg: (videoInfo as { duration?: number }).duration ?? 0,
        tipo_video: "sin_clasificar",
        estado: "recibido",
        caption: captionText ?? "",
      })
      .select("id")
      .single();

    if (error) throw error;

    await sendMessage(
      chatId,
      `✅ <b>¡Vídeo recibido!</b>\n\n` +
      `Modelo: ${modelo.nombre}\n` +
      `Archivo: ${fileName}\n\n` +
      `Tu vídeo está en cola para edición. Te avisamos cuando esté listo.`
    );

    return NextResponse.json({ ok: true, content_id: content?.id });
  } catch (e) {
    console.error("Telegram webhook error:", e);
    await sendMessage(chatId, `⚠️ Hubo un error procesando tu vídeo. Por favor inténtalo de nuevo o avisa a tu manager.`);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET endpoint for Telegram webhook verification
export async function GET() {
  return NextResponse.json({ ok: true, status: "Halo Telegram Bot webhook active" });
}
