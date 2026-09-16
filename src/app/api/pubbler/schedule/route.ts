import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Pubbler API: https://app.publer.io/api/v1
const PUBBLER_BASE = "https://app.publer.io/api/v1";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    account_ids: string[];     // Pubbler account IDs (IG accounts linked in Pubbler)
    caption: string;           // Caption completo con hashtags
    video_url: string;         // URL pública del vídeo en R2
    scheduled_at: string;      // ISO datetime para programar
    thumbnail_url?: string;
  };

  const apiKey = process.env.PUBBLER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "PUBBLER_API_KEY no configurado. Añádelo en .env.local cuando actives el plan.",
      demo: true,
    }, { status: 400 });
  }

  if (!body.account_ids?.length) {
    return NextResponse.json({ error: "account_ids requerido" }, { status: 400 });
  }

  // Create post in Pubbler
  const res = await fetch(`${PUBBLER_BASE}/posts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_ids: body.account_ids,
      text: body.caption,
      media_items: [{ url: body.video_url }],
      scheduled_at: body.scheduled_at,
      post_type: "reel",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ ok: true, pubbler: data });
}

// GET: list upcoming slots based on strategy
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = searchParams.get("days") ?? "7";

  // Strategy comes from query params (stored in client localStorage)
  const postingDays = (searchParams.get("days_of_week") ?? "1,3,5").split(",").map(Number); // 0=Sun..6=Sat
  const postingTimes = (searchParams.get("times") ?? "09:00,18:00").split(",");
  const postsPerDay = parseInt(searchParams.get("posts_per_day") ?? "1");

  const slots: string[] = [];
  const now = new Date();
  const limit = parseInt(days) * postingTimes.length;

  for (let d = 0; d < parseInt(days) * 2 && slots.length < limit; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    if (!postingDays.includes(date.getDay())) continue;

    for (const time of postingTimes.slice(0, postsPerDay)) {
      const [h, m] = time.split(":").map(Number);
      const slot = new Date(date);
      slot.setHours(h, m, 0, 0);
      if (slot > now) slots.push(slot.toISOString());
    }
  }

  return NextResponse.json({ slots: slots.slice(0, 10) });
}
