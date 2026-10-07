import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { keyBrutoAlternativas } from "@/lib/media";
import { exigirFila } from "@/lib/alcance";

export const dynamic = "force-dynamic";

// GET /api/aprobacion/original?id=<library_content.id>
// Redirige al video bruto original reproducible desde el navegador. Las keys
// r2_key_original de subidas del portal usan el esquema "supabase://bucket/path"
// (bucket privado, subida con URL firmada): para esas hace falta una URL
// firmada de lectura, no basta con la URL publica de R2 que usan las demas.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  { const g = await exigirFila("library_content", id); if (g) return g; }
  const supabase = createAdminClient();
  const { data: pieza, error } = await supabase
    .from("library_content")
    .select("id, r2_key, r2_key_original, video_procesado_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !pieza) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });

  const keys = keyBrutoAlternativas(pieza);

  for (const key of keys) {
    if (key.startsWith("supabase://")) {
      const withoutScheme = key.slice("supabase://".length);
      const slash = withoutScheme.indexOf("/");
      if (slash === -1) continue;
      const bucket = withoutScheme.slice(0, slash);
      const objectPath = withoutScheme.slice(slash + 1);
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600);
      if (signed?.signedUrl) return NextResponse.redirect(signed.signedUrl);
      continue;
    }
    const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
    if (base) return NextResponse.redirect(`${base}/${key.replace(/^\/+/, "")}`);
  }

  return NextResponse.json({ error: "No se pudo resolver el video original" }, { status: 404 });
}
