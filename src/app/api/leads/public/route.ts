import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

type LeadPayload = {
  nombre?: unknown;
  email?: unknown;
  whatsapp?: unknown;
  instagram?: unknown;
  pais?: unknown;
  experiencia?: unknown;
  ingresos?: unknown;
  necesidades?: unknown;
  otro_mensaje?: unknown;
  acepta_privacidad?: unknown;
  origen?: unknown;
  landing_slug?: unknown;
  page_url?: unknown;
  referrer?: unknown;
  user_agent?: unknown;
  adjuntos?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Halo-Leads-Key",
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

function asString(value: unknown, maxLength = 1000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item, 160))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
}

function asAdjuntos(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const url = asString(raw.url, 1200);
      const key = asString(raw.key, 500);
      const name = asString(raw.name, 240);
      const contentType = asString(raw.contentType, 160);
      const kind = asString(raw.kind, 20);
      const size = Number(raw.size);
      if (!url || !key || !name || !contentType) return null;
      return {
        url,
        key,
        name,
        contentType,
        kind: kind === "video" ? "video" : "image",
        size: Number.isFinite(size) && size > 0 ? Math.round(size) : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 80);
}

function isAuthorized(req: NextRequest) {
  const expected = process.env.LEADS_INGEST_KEY ?? process.env.HALO_LEADS_INGEST_KEY;
  if (!expected) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerKey = req.headers.get("x-halo-leads-key")?.trim();
  return bearer === expected || headerKey === expected;
}

function getPageUrl(req: NextRequest, body: LeadPayload) {
  return asString(body.page_url, 1000) ?? req.headers.get("origin") ?? null;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as LeadPayload;
    const nombre = asString(body.nombre, 240);
    const email = asString(body.email, 320);
    const whatsapp = asString(body.whatsapp, 80);
    const instagram = asString(body.instagram, 500);
    const pais = asString(body.pais, 160);

    if (!nombre || !email || !whatsapp || !instagram || !pais) {
      return json({ error: "nombre, email, whatsapp, instagram y pais son obligatorios" }, { status: 400 });
    }

    if (!canUseSupabase()) {
      return json({ ok: true, skipped: true });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("leads")
      .insert({
        estado: "nuevo",
        nombre,
        email,
        whatsapp,
        instagram,
        pais,
        experiencia: asString(body.experiencia, 240),
        ingresos: asString(body.ingresos, 240),
        necesidades: asStringArray(body.necesidades),
        otro_mensaje: asString(body.otro_mensaje, 2000),
        acepta_privacidad: body.acepta_privacidad === true,
        origen: asString(body.origen, 120) ?? "web",
        landing_slug: asString(body.landing_slug, 160),
        page_url: getPageUrl(req, body),
        referrer: asString(body.referrer, 1000) ?? req.headers.get("referer"),
        user_agent: asString(body.user_agent, 1000) ?? req.headers.get("user-agent"),
        adjuntos: asAdjuntos(body.adjuntos),
      })
      .select("id")
      .single();

    if (error) throw error;

    return json({ ok: true, id: data?.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
