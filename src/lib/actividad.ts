import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";

// Avisos para el dueño y datos del registro de actividad del resto de usuarios (ver actividadEdge.ts).

const cuando = (iso: string) => {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
};

/** Acciones sensibles de los últimos 7 días (borrados, cambios de contraseña, accesos de portal...), agrupadas. */
export const avisosActividad = cache(async (): Promise<Array<{ nivel: "rojo"; texto: string; href: string }>> => {
  try {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await createAdminClient()
      .from("panel_actividad")
      .select("usuario, accion, created_at")
      .eq("sensible", true)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(300);
    const grupos = new Map<string, { usuario: string; accion: string; n: number; ultima: string }>();
    for (const f of data ?? []) {
      const dia = String(f.created_at).slice(0, 10);
      const clave = `${f.usuario}|${f.accion}|${dia}`;
      const g = grupos.get(clave);
      if (g) g.n++;
      else grupos.set(clave, { usuario: String(f.usuario), accion: String(f.accion), n: 1, ultima: String(f.created_at) });
    }
    return [...grupos.values()]
      .slice(0, 5)
      .map((g) => ({ nivel: "rojo" as const, texto: `${g.usuario}: ${g.accion}${g.n > 1 ? ` (${g.n} veces)` : ""} · ${cuando(g.ultima)}`, href: "/logs?origen=usuarios" }));
  } catch {
    return [];
  }
});
