import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { borrarDeR2 } from "@/lib/r2";
import { encolarTelegram } from "@/lib/telegramCola";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ES_ORIGINAL = /^(bruto\/|supabase:\/\/portal-uploads\/)/;

// POST { ids: [...], motivo? }  Elimina reels de captacion que NO gustan (los que siguen EN ESPERA, sin editar): la fila, el original y su vista previa.
// Como ya no estan, dejan de contar entre los reels de la modelo y tiene que grabar otros. Si tiene Telegram, se le avisa (con el motivo, si se da).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  { const g = await exigirModelo(id); if (g) return g; }
  const body = (await req.json().catch(() => null)) as { ids?: unknown; motivo?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "Elige qué reels eliminar" }, { status: 400 });
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 300) : "";

  const db = createAdminClient();
  const { data } = await db.from("library_content").select("id, titulo, filename_original, r2_key, r2_key_original").eq("modelo_id", id).eq("estado", "recibido").in("id", ids);
  const piezas = (data ?? []) as Array<{ id: string; titulo: string | null; filename_original: string | null; r2_key: string | null; r2_key_original: string | null }>;
  if (!piezas.length) return NextResponse.json({ error: "Esos reels ya no están en espera (puede que ya se hayan mandado a editar)" }, { status: 404 });

  const { data: borradas, error } = await db.from("library_content").delete().in("id", piezas.map((p) => p.id)).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const hechas = new Set((borradas ?? []).map((b) => b.id as string));

  // Archivos: el original y su vista previa, salvo que otra pieza siga usando ese mismo original
  const claves = [...new Set(piezas.filter((p) => hechas.has(p.id)).flatMap((p) => [p.r2_key_original, p.r2_key]).filter((k): k is string => Boolean(k) && ES_ORIGINAL.test(k as string)))];
  if (claves.length) {
    const [a, b] = await Promise.all([db.from("library_content").select("r2_key, r2_key_original").in("r2_key", claves), db.from("library_content").select("r2_key, r2_key_original").in("r2_key_original", claves)]);
    const enUso = new Set([...(a.data ?? []), ...(b.data ?? [])].flatMap((r) => [r.r2_key as string | null, r.r2_key_original as string | null]).filter(Boolean));
    await Promise.all(
      claves
        .filter((k) => !enUso.has(k))
        .map(async (k) => {
          try {
            if (k.startsWith("supabase://")) {
              const sin = k.slice("supabase://".length);
              const barra = sin.indexOf("/");
              await db.storage.from(sin.slice(0, barra)).remove([sin.slice(barra + 1)]);
            } else {
              await borrarDeR2(k);
            }
            const h = createHash("sha1").update(k).digest("hex").slice(0, 20);
            await Promise.all([`previews/${h}.jpg`, `previews/${h}.mp4`].map((p) => borrarDeR2(p).catch(() => undefined)));
          } catch {
            /* el archivo suelto se limpia en el barrido de mantenimiento; la fila ya no existe */
          }
        }),
    );
  }

  const nombres = piezas.filter((p) => hechas.has(p.id)).map((p) => p.filename_original ?? p.titulo ?? "vídeo");
  await encolarTelegram("modelo_borrado", id, { nombres, motivo: motivo || null });
  return NextResponse.json({ ok: true, eliminados: hechas.size });
}
