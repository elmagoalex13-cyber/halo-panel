import { NextResponse } from "next/server";
import { SLOTS, ZONA, publerActivo, cuentasPublerInstagram } from "@/lib/publer";

export const dynamic = "force-dynamic";

// Estado de la conexion con Publer y ritmo de publicacion (para la pagina de Ajustes)
export async function GET() {
  const base = { slots: SLOTS, zona: ZONA, configurado: publerActivo() };
  if (!publerActivo()) return NextResponse.json({ ...base, conectado: false, cuentas: [] });
  try {
    const cuentas = (await cuentasPublerInstagram()).map((c) => c.name);
    return NextResponse.json({ ...base, conectado: true, cuentas });
  } catch (e) {
    return NextResponse.json({ ...base, conectado: false, cuentas: [], error: e instanceof Error ? e.message : "Error" });
  }
}
