import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export type TrialReelRow = {
  id: string;
  cuenta_id: string;
  cuenta_username: string | null;
  modelo_nombre: string | null;
  estado: string;
  storage_path_spoofeado: string | null;
  sha256_original: string | null;
  usos_previos: number;
  ultima_vez_usado: string | null;
  riesgo_repeticion: boolean;
  spoofer_params: Record<string, unknown> | null;
  views_original: number | null;
  likes_original: number | null;
  publicado_en: string | null;
  creado_en: string;
  // joined from pieza original
  pieza_origen_r2_key: string | null;
  pieza_origen_tipo: string | null;
};

const DEMO_ROWS: TrialReelRow[] = [
  {
    id: "trial-demo-1",
    cuenta_id: "cuenta-demo-1",
    cuenta_username: "laura_official",
    modelo_nombre: "Laura M.",
    estado: "pendiente_aprobacion",
    storage_path_spoofeado: null,
    sha256_original: "abc123",
    usos_previos: 1,
    ultima_vez_usado: new Date(Date.now() - 35 * 86400000).toISOString().split("T")[0],
    riesgo_repeticion: false,
    spoofer_params: { trim_start: 1, trim_end: 1, zoom: 1.03, brightness: 1.02, contrast: 1.03, saturation: 1.05 },
    views_original: 48700,
    likes_original: 3200,
    publicado_en: null,
    creado_en: new Date().toISOString(),
    pieza_origen_r2_key: null,
    pieza_origen_tipo: "tipo2",
  },
  {
    id: "trial-demo-2",
    cuenta_id: "cuenta-demo-2",
    cuenta_username: "sofia_halo",
    modelo_nombre: "Sofía R.",
    estado: "pendiente_aprobacion",
    storage_path_spoofeado: null,
    sha256_original: "def456",
    usos_previos: 0,
    ultima_vez_usado: null,
    riesgo_repeticion: false,
    spoofer_params: { trim_start: 1, trim_end: 1, zoom: 1.03, brightness: 0.98, contrast: 1.03, saturation: 0.97 },
    views_original: 125000,
    likes_original: 8900,
    publicado_en: null,
    creado_en: new Date(Date.now() - 3600000).toISOString(),
    pieza_origen_r2_key: null,
    pieza_origen_tipo: "tipo1",
  },
];

export async function GET() {
  if (!canUseSupabase()) {
    return NextResponse.json({ data: DEMO_ROWS });
  }
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("trial_reels")
      .select(`
        id, cuenta_id, estado, storage_path_spoofeado, sha256_original,
        usos_previos, ultima_vez_usado, riesgo_repeticion, spoofer_params,
        views_original, likes_original, publicado_en, creado_en,
        cuentas_instagram(username, modelos(nombre)),
        piezas_montaje(r2_key:storage_path_montaje, tipo_video)
      `)
      .in("estado", ["pendiente_aprobacion"])
      .order("creado_en", { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows: TrialReelRow[] = ((data ?? []) as unknown[]).map((row: unknown) => {
      const r = row as Record<string, unknown>;
      const cuenta = r.cuentas_instagram as Record<string, unknown> | null;
      const modelo = cuenta?.modelos as Record<string, unknown> | null;
      const pieza = r.piezas_montaje as Record<string, unknown> | null;
      return {
        id: r.id as string,
        cuenta_id: r.cuenta_id as string,
        cuenta_username: (cuenta?.username as string) ?? null,
        modelo_nombre: (modelo?.nombre as string) ?? null,
        estado: r.estado as string,
        storage_path_spoofeado: (r.storage_path_spoofeado as string) ?? null,
        sha256_original: (r.sha256_original as string) ?? null,
        usos_previos: (r.usos_previos as number) ?? 0,
        ultima_vez_usado: (r.ultima_vez_usado as string) ?? null,
        riesgo_repeticion: (r.riesgo_repeticion as boolean) ?? false,
        spoofer_params: (r.spoofer_params as Record<string, unknown>) ?? null,
        views_original: (r.views_original as number) ?? null,
        likes_original: (r.likes_original as number) ?? null,
        publicado_en: (r.publicado_en as string) ?? null,
        creado_en: r.creado_en as string,
        pieza_origen_r2_key: (pieza?.r2_key as string) ?? null,
        pieza_origen_tipo: (pieza?.tipo_video as string) ?? null,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    return NextResponse.json({ data: DEMO_ROWS, _error: String(err) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, accion, nota } = await req.json() as { id: string; accion: "aprobar" | "rechazar"; nota?: string };

    if (!canUseSupabase()) {
      return NextResponse.json({ ok: true, demo: true });
    }

    const supabase = createAdminClient();

    if (accion === "aprobar") {
      const { error } = await supabase
        .from("trial_reels")
        .update({ estado: "aprobado", aprobado_en: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("trial_reels")
        .update({ estado: "rechazado", nota_rechazo: nota ?? null })
        .eq("id", id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
