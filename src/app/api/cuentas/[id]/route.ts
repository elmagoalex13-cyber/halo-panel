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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ["username", "url", "activa", "metricool_blog_id", "metricool_estado", "red_social"] as const;
    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }
    if ("username" in payload) payload.username = normalizarUsername(String(payload.username ?? ""));
    if ("red_social" in payload && !REDES.includes(payload.red_social as RedSocial)) {
      delete payload.red_social;
    }
    if (payload.username && "red_social" in payload && !("url" in payload)) {
      payload.url = urlSocial(payload.red_social as RedSocial, String(payload.username));
    }

    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const supabase = createAdminClient();
    let { data, error } = await supabase.from("cuentas_instagram").update(payload).eq("id", id).select().single();
    if (error && /red_social/.test(error.message)) {
      const legacyPayload = { ...payload };
      delete legacyPayload.red_social;
      ({ data, error } = await supabase.from("cuentas_instagram").update(legacyPayload).eq("id", id).select().single());
    }
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

    const { error } = await createAdminClient().from("cuentas_instagram").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
