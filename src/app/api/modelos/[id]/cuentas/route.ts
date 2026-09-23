import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

const REDES = ["instagram", "twitter", "tiktok"] as const;
type RedSocial = (typeof REDES)[number];
type CuentaPayload = {
  modelo_id: string;
  red_social?: RedSocial;
  username: string;
  url: string;
  activa: boolean;
  tipo?: "principal";
};

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
    const redSocial = REDES.includes(body.red_social as RedSocial) ? (body.red_social as RedSocial) : "instagram";
    const username = normalizarUsername(body.username);
    const payload = {
      modelo_id: id,
      red_social: redSocial,
      username,
      url: body.url || urlSocial(redSocial, username),
      activa: body.activa ?? true,
      tipo: "principal" as const,
    };
    if (!payload.username) return NextResponse.json({ error: "Falta username" }, { status: 400 });

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload } });
    }

    const supabase = createAdminClient();
    async function insertar(candidate: CuentaPayload) {
      return supabase.from("cuentas_instagram").insert(candidate).select().single();
    }

    let { data, error } = await insertar(payload);
    if (error && /red_social/.test(error.message)) {
      const legacyPayload: CuentaPayload = {
        modelo_id: payload.modelo_id,
        username: payload.username,
        url: payload.url,
        activa: payload.activa,
        tipo: payload.tipo,
      };
      ({ data, error } = await insertar(legacyPayload));
    }
    if (error && /tipo/.test(error.message)) {
      const modernPayload: CuentaPayload = {
        modelo_id: payload.modelo_id,
        red_social: payload.red_social,
        username: payload.username,
        url: payload.url,
        activa: payload.activa,
      };
      ({ data, error } = await insertar(modernPayload));
    }
    if (error && /red_social/.test(error.message)) {
      const basicPayload = {
        modelo_id: payload.modelo_id,
        username: payload.username,
        url: payload.url,
        activa: payload.activa,
      };
      ({ data, error } = await insertar(basicPayload));
    }
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
