import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

const REDES = ["instagram", "twitter", "tiktok"] as const;
type RedSocial = (typeof REDES)[number];

function normalizarUsername(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const part = url.pathname.split("/").filter(Boolean)[0];
    return (part || value).replace(/^@/, "").trim();
  } catch {
    return value.replace(/^@/, "").trim();
  }
}

function urlSocial(red: RedSocial, username: string) {
  if (red === "twitter") return `https://x.com/${username}`;
  if (red === "tiktok") return `https://www.tiktok.com/@${username}`;
  return `https://www.instagram.com/${username}/`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const redSocial = REDES.includes(body.red_social) ? body.red_social : "instagram";
    const username = normalizarUsername(body.username);
    const payload = {
      modelo_id: id,
      red_social: redSocial,
      username,
      url: body.url || urlSocial(redSocial, username),
      activa: body.activa ?? true,
    };
    if (!payload.username) return NextResponse.json({ error: "Falta username" }, { status: 400 });

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload } });
    }

    const supabase = createAdminClient();
    let { data, error } = await supabase.from("cuentas_instagram").insert(payload).select().single();
    if (error && /red_social/.test(error.message)) {
      const legacyPayload = {
        modelo_id: payload.modelo_id,
        username: payload.username,
        url: payload.url,
        activa: payload.activa,
      };
      ({ data, error } = await supabase.from("cuentas_instagram").insert(legacyPayload).select().single());
    }
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
