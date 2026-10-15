import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { canUseSupabase } from "@/lib/supabase/server";
import { exigirModelo } from "@/lib/alcance";
import { sesionPanelActual } from "@/lib/panelUsuarios";
import { cambiarNotas, leerNotas, ordenarNotas } from "@/lib/notasModelo";

export const dynamic = "force-dynamic";

const limpiar = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");

// GET -> notas de la modelo. POST { texto, fijada? } -> añade. PATCH { nota_id, texto?, fijada? } -> edita o fija. DELETE ?nota_id= -> borra.
// Las ven y las escriben los dos (dueño y socio), pero solo de las modelos que cada uno puede ver.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  return NextResponse.json({ notas: ordenarNotas((await leerNotas(id)).notas) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const sesion = await sesionPanelActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { texto?: unknown; fijada?: unknown };
  const texto = limpiar(b.texto);
  if (!texto) return NextResponse.json({ error: "Escribe la nota" }, { status: 400 });
  try {
    const notas = await cambiarNotas(id, (l) => [...l, { id: randomUUID(), texto, autor: sesion.nombre || sesion.usuario, creada: new Date().toISOString(), ...(b.fijada === true ? { fijada: true } : {}) }]);
    return NextResponse.json({ ok: true, notas: ordenarNotas(notas ?? []) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const b = (await req.json().catch(() => ({}))) as { nota_id?: unknown; texto?: unknown; fijada?: unknown };
  const notaId = typeof b.nota_id === "string" ? b.nota_id : "";
  if (!notaId) return NextResponse.json({ error: "Falta la nota" }, { status: 400 });
  const texto = b.texto === undefined ? null : limpiar(b.texto);
  if (texto === "") return NextResponse.json({ error: "La nota no puede quedar vacía" }, { status: 400 });
  try {
    const notas = await cambiarNotas(id, (l) => {
      if (!l.some((n) => n.id === notaId)) return null;
      return l.map((n) => (n.id !== notaId ? n : { ...n, ...(texto !== null && texto !== n.texto ? { texto, editada: new Date().toISOString() } : {}), ...(typeof b.fijada === "boolean" ? { fijada: b.fijada } : {}) }));
    });
    return notas ? NextResponse.json({ ok: true, notas: ordenarNotas(notas) }) : NextResponse.json({ error: "La nota ya no existe" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { id } = await params;
  const g = await exigirModelo(id);
  if (g) return g;
  const notaId = req.nextUrl.searchParams.get("nota_id") ?? "";
  try {
    const notas = await cambiarNotas(id, (l) => (l.some((n) => n.id === notaId) ? l.filter((n) => n.id !== notaId) : null));
    return NextResponse.json({ ok: true, notas: ordenarNotas(notas ?? (await leerNotas(id)).notas) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 500 });
  }
}
