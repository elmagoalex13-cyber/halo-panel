import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

// Avisos de Telegram PARA LAS MODELOS: cada una enlaza su Telegram con el bot desde su portal (boton "Activar avisos") y, desde entonces,
// el bot le escribe con lo que le falta por hacer y el feedback del equipo. El enlace lleva un codigo firmado (no se puede falsificar
// para vincular el Telegram de otra persona a una modelo ajena). El editor (runner) hace la vinculacion y los envios.

const secreto = () => process.env.CRON_SECRET ?? "";

/** Codigo del enlace t.me/<bot>?start=<codigo>: id de la modelo (22 caracteres) + firma (10). Solo letras, numeros, "-" y "_". */
export function codigoVinculo(modeloId: string): string | null {
  const s = secreto();
  if (!s) return null;
  const id = Buffer.from(modeloId.replace(/-/g, ""), "hex").toString("base64url");
  const mac = createHmac("sha256", s).update(modeloId).digest("base64url").slice(0, 10);
  return `${id}${mac}`;
}

/** Estado del enlace de una modelo: si ya esta vinculada y, si no, la URL para vincular. */
export async function estadoTelegramModelo(modeloId: string): Promise<{ vinculado: boolean; url: string | null }> {
  try {
    const db = createAdminClient();
    const [{ data: m }, { data: bot }] = await Promise.all([
      db.from("modelos").select("telegram_id").eq("id", modeloId).maybeSingle(),
      db.from("panel_config").select("value").eq("key", "telegram_bot").maybeSingle(),
    ]);
    if (m?.telegram_id) return { vinculado: true, url: null };
    const username = (bot?.value as { username?: string } | null)?.username;
    const codigo = codigoVinculo(modeloId);
    return { vinculado: false, url: username && codigo ? `https://t.me/${username}?start=${codigo}` : null };
  } catch {
    return { vinculado: false, url: null };
  }
}
