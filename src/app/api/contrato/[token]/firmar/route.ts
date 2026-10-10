import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";
import { generarPdfContrato } from "@/lib/contratoPdf";
import { enviarCopiaFirmada } from "@/lib/contratos";
import { encolarTelegram } from "@/lib/telegramCola";

export const dynamic = "force-dynamic";

// PUBLICO (lo usa la modelo desde el enlace del email): firma el contrato. El token es el secreto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { nombre_firmante?: unknown; dni?: unknown; firma?: unknown; acepta?: unknown };
  const nombreFirmante = typeof body.nombre_firmante === "string" ? body.nombre_firmante.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const dni = typeof body.dni === "string" ? body.dni.trim().toUpperCase().replace(/[\s.-]/g, "").slice(0, 20) : "";
  const firma = typeof body.firma === "string" ? body.firma : "";
  if (body.acepta !== true) return NextResponse.json({ error: "Marca la casilla para confirmar que has leído y aceptas el contrato" }, { status: 400 });
  if (nombreFirmante.length < 3) return NextResponse.json({ error: "Escribe tu nombre completo" }, { status: 400 });
  if (!/^[A-Z0-9]{5,20}$/.test(dni)) return NextResponse.json({ error: "Escribe tu DNI o NIE (sin espacios)" }, { status: 400 });
  if (!firma.startsWith("data:image/png;base64,") || firma.length < 1200 || firma.length > 400_000) return NextResponse.json({ error: "Dibuja tu firma en el recuadro" }, { status: 400 });

  const db = createAdminClient();
  const { data: c } = await db.from("contratos_modelos").select("*").eq("token", token).maybeSingle();
  if (!c || c.estado === "cancelado") return NextResponse.json({ error: "Este enlace ya no está disponible. Pídenos uno nuevo." }, { status: 404 });
  if (c.estado === "firmado") return NextResponse.json({ error: "Este contrato ya está firmado." }, { status: 409 });

  const ahora = new Date().toISOString();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;

  // "Solo la primera firma gana": si dos peticiones llegan a la vez, la segunda no actualiza nada
  const { data: marcado, error } = await db
    .from("contratos_modelos")
    .update({ estado: "firmado", firmado_at: ahora, firma_creadora: firma, nombre_firmante: nombreFirmante, dni, firmante_ip: ip, firmante_ua: ua })
    .eq("id", c.id)
    .in("estado", ["enviado", "visto"])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!marcado?.length) return NextResponse.json({ error: "Este contrato ya está firmado." }, { status: 409 });

  // PDF firmado: se guarda en R2 y se manda copia por email; si algo de esto falla, la firma ya esta registrada y se puede regenerar
  let pdf: Uint8Array | null = null;
  try {
    pdf = await generarPdfContrato({ nombre: c.nombre, fechaInicio: c.fecha_inicio, firmaAgencia: c.firma_agencia, firmaCreadora: firma, nombreFirmante, dni, firmadoAt: ahora, firmanteIp: ip });
    const key = `contratos/${token}.pdf`;
    await uploadToR2(key, pdf, "application/pdf");
    await db.from("contratos_modelos").update({ pdf_key: key }).eq("id", c.id);
  } catch (e) {
    console.error("[contratos] pdf firmado:", e instanceof Error ? e.message : e);
  }
  if (pdf) await enviarCopiaFirmada({ nombre: c.nombre, email: c.email }, pdf).catch(() => undefined);
  await encolarTelegram("contrato_firmado", null, { nombre: c.nombre, enviado_por: c.enviado_por ?? null });

  return NextResponse.json({ ok: true });
}
