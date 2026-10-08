import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual } from "@/lib/alcance";
import { errorDb } from "@/lib/erroresDb";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.nombre !== "string" || !body.nombre.trim()) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    const payload = {
      nombre: body.nombre.trim(),
      nombre_real: body.nombre_real || null,
      email: body.email || null,
      telefono: body.telefono || null,
      notas: body.notas || null,
      porcentaje_comision: body.porcentaje_comision ?? 70,
      activa: true,
      fecha_alta: new Date().toISOString().split("T")[0],
    };

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, instagram: [] } });
    }

    const supabase = createAdminClient();
    // Por defecto nace COMPARTIDA. Solo el dueño puede crearla privada; lo que mete su socio es siempre compartido
    const alcance = await alcanceActual();
    const ambito = alcance.dueno && body.ambito === "privado" ? "privado" : "compartido";
    // Las modelos compartidas empiezan en fase de captacion: 30 videos antes de editar y de crearles la cuenta de Instagram
    const compartida = ambito === "compartido";
    const conCaptacion = { ...payload, ambito, objetivo_videos: compartida ? 30 : null, objetivo_scripts: compartida ? 4 : null, objetivo_packs: compartida ? 5 : null, objetivo_posts: compartida ? 30 : null };
    let { data, error } = await supabase.from("modelos").insert(conCaptacion).select().single();
    if (error && /objetivo_(videos|scripts|packs|posts)/i.test(error.message)) ({ data, error } = await supabase.from("modelos").insert({ ...payload, ambito, ...(/objetivo_videos/i.test(error.message) ? {} : { objetivo_videos: compartida ? 30 : null }) }).select().single()); // faltan SQL 20261020/22
    if (error && /ambito/i.test(error.message)) {
      // Falta el SQL 20261013: solo el dueño puede seguir creando modelos (como antes)
      if (!alcance.dueno) return NextResponse.json({ error: "Falta ejecutar el SQL 20261013_modelos_ambito.sql en Supabase." }, { status: 409 });
      ({ data, error } = await supabase.from("modelos").insert(payload).select().single());
    }
    if (error) {
      const e = errorDb(error, "No se pudo crear la modelo");
      return NextResponse.json({ error: e.mensaje }, { status: e.estado });
    }
    return NextResponse.json({ data });
  } catch (error) {
    const e = errorDb(error, "Error interno");
    return NextResponse.json({ error: e.mensaje }, { status: e.estado });
  }
}
