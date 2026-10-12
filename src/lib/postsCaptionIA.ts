// Caption de un post de OnlyFans escrito por la IA (Claude) a partir de la foto y de la voz de la modelo.
// Claude escribe captions sugerentes; si la foto es sexualmente explicita no la describe: el post queda «para poner el caption a mano».

export type ResultadoCaption = { ok: true; caption: string } | { ok: false; motivo: "explicita" | "rechazada" | "error"; detalle?: string };

const MODELO = process.env.POSTS_IA_MODELO ?? "claude-haiku-4-5";

export async function generarCaption(p: { imagenBase64: string; persona: string; recientes: string[] }): Promise<ResultadoCaption> {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) return { ok: false, motivo: "error", detalle: "Falta ANTHROPIC_API_KEY" };

  const instrucciones = `Eres el community manager de una creadora de contenido adulta (mayor de edad) que publica en su feed de OnlyFans. Escribe UN solo caption en español para la foto adjunta.

Reglas:
- Sugerente y juguetón, pero NO explícito (nada de palabras sexuales explícitas).
- 1 o 2 frases cortas, 0 a 2 emojis, sin hashtags, sin comillas.
- Coherente con lo que se ve (ropa, ambiente, pose, gesto). No inventes datos personales.
- En primera persona, con la voz de la creadora. Puede cerrar con una pregunta o una invitación suave a escribirle o a quedarse.
${p.persona ? `\nVoz de la creadora: ${p.persona}\n` : ""}${p.recientes.length ? `\nNo repitas ni te parezcas a sus captions recientes:\n${p.recientes.map((c) => `- ${c}`).join("\n")}\n` : ""}
Si la foto es sexualmente explícita (desnudo integral o actos sexuales), responde únicamente con la palabra EXPLICITA.
Responde solo con el caption.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 200,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.imagenBase64 } }, { type: "text", text: instrucciones }] }],
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, motivo: "error", detalle: j.error?.message ?? `Anthropic respondió ${res.status}` };
    if (j.stop_reason === "refusal") return { ok: false, motivo: "rechazada" };
    const texto = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim().replace(/^["“]|["”]$/g, "");
    if (!texto) return { ok: false, motivo: "rechazada" };
    if (/^explicita\.?$/i.test(texto)) return { ok: false, motivo: "explicita" };
    return { ok: true, caption: texto.slice(0, 600) };
  } catch (e) {
    return { ok: false, motivo: "error", detalle: e instanceof Error ? e.message : "Error de red" };
  }
}

/** Resumen de la voz de la modelo a partir de su onboarding (nombre artistico, palabras, personalidad, acento, hobbies...). */
export function personaDe(datos: Record<string, unknown> | null | undefined): string {
  if (!datos) return "";
  const v = (k: string) => (typeof datos[k] === "string" ? (datos[k] as string).trim() : "");
  const partes = [
    v("nombre") && `se llama ${v("nombre")}`,
    v("palabras") && `se describe como: ${v("palabras")}`,
    v("personalidad") && `personalidad: ${v("personalidad")}`,
    v("acento") && `habla: ${v("acento")}`,
    v("ocupacion") && `ocupación: ${v("ocupacion")}`,
    v("hobbies") && `le gusta: ${v("hobbies").slice(0, 200)}`,
  ].filter(Boolean);
  return partes.join(". ").slice(0, 700);
}
