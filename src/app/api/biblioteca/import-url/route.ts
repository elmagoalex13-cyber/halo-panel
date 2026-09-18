import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/biblioteca/import-url
// Importa vídeos por URL (hasta 100) a library_content
// Body: { modelo_id: string, urls: string | string[], cuenta_id?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modelo_id, urls: rawUrls, cuenta_id } = body;

    if (!modelo_id) {
      return NextResponse.json({ error: "modelo_id requerido" }, { status: 400 });
    }

    const urls: string[] = (Array.isArray(rawUrls) ? rawUrls : rawUrls?.split("\n") ?? [])
      .map((u: string) => u.trim())
      .filter(Boolean)
      .slice(0, 100);

    if (!urls.length) {
      return NextResponse.json({ error: "Al menos una URL requerida" }, { status: 400 });
    }

    if (!canUseSupabase()) {
      return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
    }

    const supabase = createAdminClient();
    const R2_PUBLIC = process.env.R2_PUBLIC_URL ?? "https://pub-308516fd67564470b898ebec93a764c5.r2.dev";
    const results: { url: string; ok: boolean; error?: string; duplicate?: boolean }[] = [];

    for (const url of urls) {
      try {
        // Detectar si es una URL de R2
        const isR2 = url.includes(".r2.dev") || url.includes(".r2.cloudflarestorage.com");
        let r2Key: string;

        if (isR2) {
          // Extraer la key de la URL pública de R2
          const match = url.match(/r2\.dev\/(.+)$/) ?? url.match(/cloudflarestorage\.com\/[^/]+\/(.+)$/);
          r2Key = match?.[1] ?? `imported/${modelo_id}/${randomUUID()}.mp4`;
        } else {
          // URL externa: usar como placeholder, el runner la descargará si la necesita
          r2Key = `pending/${modelo_id}/${randomUUID()}.mp4`;
        }

        // Dedup por r2_url
        const { data: existing } = await supabase
          .from("library_content")
          .select("id")
          .eq("r2_url", url)
          .maybeSingle();

        if (existing) {
          results.push({ url, ok: false, duplicate: true });
          continue;
        }

        const { error } = await supabase.from("library_content").insert({
          modelo_id,
          cuenta_id: cuenta_id ?? null,
          origen: "upload_manual",
          r2_key: r2Key,
          r2_url: url,
          estado: "recibido",
          estado_procesamiento: "sin_procesar",
          recibido_at: new Date().toISOString(),
          titulo: url.split("/").pop()?.split("?")[0] ?? "imported",
        });

        if (error) {
          results.push({ url, ok: false, error: error.message });
        } else {
          results.push({ url, ok: true });
        }
      } catch (e) {
        results.push({ url, ok: false, error: String(e) });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    const duplicates = results.filter((r) => r.duplicate).length;
    const errors = results.filter((r) => !r.ok && !r.duplicate).length;

    return NextResponse.json(
      { summary: { total: urls.length, ok, duplicates, errors }, results },
      { status: 207 }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
