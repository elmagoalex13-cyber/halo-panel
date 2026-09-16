import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { canUseMetricool, fetchMetricoolAccountStats } from "@/lib/metricool";
import type { MetricoolEstado } from "@/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const metricool_blog_id = String(body.metricool_blog_id || "").trim();
    if (!metricool_blog_id) return NextResponse.json({ error: "Falta el Blog ID de Metricool" }, { status: 400 });

    let metricool_estado: MetricoolEstado = "conectada";
    if (canUseMetricool()) {
      try {
        await fetchMetricoolAccountStats(metricool_blog_id);
      } catch {
        metricool_estado = "error";
      }
    }

    if (!canUseSupabase()) {
      return NextResponse.json({ data: { id, metricool_blog_id, metricool_estado } });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("cuentas_instagram")
      .update({ metricool_blog_id, metricool_estado })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
