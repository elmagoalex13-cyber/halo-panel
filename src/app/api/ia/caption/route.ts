import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    tipo_video: string;
    frase_quemada?: string;
    modelo_nombre?: string;
    titulo?: string;
    hashtags?: string[];   // 3 seleccionados para este vídeo
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurado" }, { status: 400 });
  }

  const tipoLabel: Record<string, string> = {
    referencia: "vídeo de referencia (imita un viral)",
    frase: "vídeo con frase motivacional y música",
    subtitulos: "vídeo con subtítulos",
    reels: "reel de Instagram",
    sin_clasificar: "vídeo",
  };

  const prompt = `Eres un experto en marketing de redes sociales especializado en cuentas de modelos de Instagram. 
Genera un caption para Instagram con estas características:
- MUY corto: máximo 3-4 líneas
- En español
- Que llame la atención desde la primera palabra
- Con CTA al final (ej: "Sígueme 🔥", "Comenta 👇", "Guárdalo para después 📌", etc.)
- Sin hashtags (los añadiremos aparte)
- Tono: atrevido, confiado, aspiracional

Datos del vídeo:
- Tipo: ${tipoLabel[body.tipo_video] ?? body.tipo_video}
${body.frase_quemada ? `- Frase del vídeo: "${body.frase_quemada}"` : ""}
${body.modelo_nombre ? `- Modelo: ${body.modelo_nombre}` : ""}
${body.titulo ? `- Título: ${body.titulo}` : ""}

Responde SOLO con el caption, sin explicaciones, sin comillas, sin nada más.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const captionText = data.content?.[0]?.text?.trim() ?? "";

  // Append hashtags if provided
  const hashtagStr = (body.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const full = hashtagStr ? `${captionText}\n\n${hashtagStr}` : captionText;

  return NextResponse.json({ caption: full });
}
