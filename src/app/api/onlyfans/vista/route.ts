import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/ofServer";
import { urlVista } from "@/lib/r2/onlyfans";

export const dynamic = "force-dynamic";

// GET /api/onlyfans/vista?id=<archivo> -> redirige a un enlace firmado para VER el archivo (reproductor de vídeo).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return new NextResponse(null, { status: 400 });
  if (!canUseSupabase()) return new NextResponse(null, { status: 503 });
  const { data: a } = await createAdminClient().from("of_archivos").select("storage_key, bucket").eq("id", id).maybeSingle();
  if (!a) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(await urlVista(a.storage_key, a.bucket));
}
