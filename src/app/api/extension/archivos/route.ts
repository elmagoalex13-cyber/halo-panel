import { NextRequest, NextResponse } from "next/server";
import { EXTENSION_ARCHIVOS, EXTENSION_VERSION } from "@/lib/extensionArchivos.generated";

export const dynamic = "force-dynamic";

// Ultima version de la extension "HALO Virales" y sus archivos, para el boton «Actualizar extensión» del panel.
//   GET ?solo=version -> { version }
//   GET               -> { version, archivos: { "manifest.json": "...", ... } }
// (Protegido por el middleware: solo quien esta dentro del panel. La extension no lleva claves ni datos.)
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("solo") === "version") return NextResponse.json({ version: EXTENSION_VERSION });
  return NextResponse.json({ version: EXTENSION_VERSION, archivos: EXTENSION_ARCHIVOS });
}
