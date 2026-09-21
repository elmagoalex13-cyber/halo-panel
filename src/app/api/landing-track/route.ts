import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

type LandingEventType = "pageview" | "click";

type LandingTrackPayload = {
  landingSlug?: unknown;
  landingKey?: unknown;
  eventType?: unknown;
  label?: unknown;
  destination?: unknown;
  sessionId?: unknown;
  referrer?: unknown;
  page?: unknown;
  url?: unknown;
  userAgent?: unknown;
  timestamp?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function asString(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function parseEventType(value: unknown): LandingEventType | null {
  return value === "pageview" || value === "click" ? value : null;
}

function parseTimestamp(value: unknown) {
  const input = asString(value);
  if (!input) return new Date().toISOString();
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LandingTrackPayload;
    const landingSlug = asString(body.landingSlug, 120);
    const landingKey = asString(body.landingKey, 240);
    const eventType = parseEventType(body.eventType);
    const sessionId = asString(body.sessionId, 240);

    if (!landingSlug || !landingKey || !eventType || !sessionId) {
      return json({ error: "landingSlug, landingKey, eventType y sessionId son obligatorios" }, { status: 400 });
    }

    if (!canUseSupabase()) {
      return json({ ok: true, skipped: true });
    }

    const supabase = createAdminClient();
    const { data: landing, error: landingError } = await supabase
      .from("landings")
      .select("id, slug, landing_key, activa")
      .eq("slug", landingSlug)
      .eq("landing_key", landingKey)
      .eq("activa", true)
      .single();

    if (landingError || !landing) {
      return json({ error: "Landing no encontrada o clave inválida" }, { status: 403 });
    }

    const fallbackUserAgent = req.headers.get("user-agent");
    const fallbackReferrer = req.headers.get("referer");
    const { error: insertError } = await supabase.from("landing_events").insert({
      landing_id: landing.id,
      landing_slug: landingSlug,
      event_type: eventType,
      label: asString(body.label, 240),
      destination: asString(body.destination, 1000),
      session_id: sessionId,
      referrer: asString(body.referrer, 1000) ?? fallbackReferrer,
      page: asString(body.page, 500),
      url: asString(body.url, 1000),
      user_agent: asString(body.userAgent, 1000) ?? fallbackUserAgent,
      occurred_at: parseTimestamp(body.timestamp),
    });

    if (insertError) throw insertError;

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
