import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { canUseSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/portalAuth";
import { extensionSegura, tipoDeArchivo } from "@/lib/ofServer";
import { borrarObjetoOF, listarObjetosOF, prepararSubida, tamanoEnR2 } from "@/lib/r2/onlyfans";
import { MAX_HISTORIAS, TAM_MAX_HISTORIA, invalidarHistorias, listarHistorias, prefijoHistorias } from "@/lib/historiasIG";

export const dynamic = "force-dynamic";

// Fotos de historias de Instagram de la modelo con sesion en el portal.
//  GET                      -> sus fotos (con vista previa)
//  POST { accion:"presign" } -> URL firmada para subir una foto directo a R2
//  POST { accion:"confirmar", key, size } -> comprueba que la foto llego completa (si no, la borra)
//  DELETE ?key=             -> borra una de sus fotos
async function modeloConSesion() {
  const sesion = await sesionActual();
  return sesion?.modeloId ?? null;
}

export async function GET() {
  const modeloId = await modeloConSesion();
  if (!modeloId) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  try {
    return NextResponse.json({ historias: await listarHistorias(modeloId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron cargar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const modeloId = await modeloConSesion();
  if (!modeloId) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { accion?: string; filename?: string; contentType?: string; size?: number; key?: string } | null;

  try {
    if (body?.accion === "presign") {
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0 || size > TAM_MAX_HISTORIA) return NextResponse.json({ error: "La foto pesa demasiado (máximo 40 MB)" }, { status: 400 });
      if (tipoDeArchivo(body.contentType, body.filename) !== "foto") return NextResponse.json({ error: "Aquí solo se suben fotos" }, { status: 415 });
      if ((await listarObjetosOF(prefijoHistorias(modeloId), MAX_HISTORIAS + 1)).length >= MAX_HISTORIAS) {
        return NextResponse.json({ error: "Has llegado al máximo de fotos. Borra alguna antigua para subir más." }, { status: 409 });
      }
      const contentType = body.contentType || "image/jpeg";
      const key = `${prefijoHistorias(modeloId)}${Date.now()}-${randomUUID().slice(0, 8)}.${extensionSegura(body.filename, "foto")}`;
      return NextResponse.json({ key, ...(await prepararSubida(key, contentType, size)) });
    }

    if (body?.accion === "confirmar") {
      const key = String(body.key ?? "");
      if (!key.startsWith(prefijoHistorias(modeloId)) || key.includes("..")) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
      const real = await tamanoEnR2(key);
      if (real === null) return NextResponse.json({ error: "La foto no llegó completa. Vuelve a subirla." }, { status: 404 });
      if (body.size && real !== Number(body.size)) {
        await borrarObjetoOF(key).catch(() => undefined);
        return NextResponse.json({ error: "La foto llegó incompleta. Vuelve a subirla." }, { status: 409 });
      }
      invalidarHistorias(); // que el aviso del panel salga ya
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const modeloId = await modeloConSesion();
  if (!modeloId) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key.startsWith(prefijoHistorias(modeloId)) || key.includes("..")) return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  try {
    await borrarObjetoOF(key);
    invalidarHistorias();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 500 });
  }
}
