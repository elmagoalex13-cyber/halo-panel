import { notFound } from "next/navigation";
import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { versionesFotos } from "@/lib/fotosModelos";
import { UUID } from "@/lib/ofServer";
import { urlVista } from "@/lib/r2/onlyfans";
import type { ArchivoOF, ColeccionOF } from "@/lib/onlyfans";
import { ColeccionDetalle, type ArchivoConVista } from "./ColeccionDetalle";

export const dynamic = "force-dynamic";

export default async function ColeccionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !canUseSupabase()) notFound();
  const supabase = createAdminClient();

  const [{ data: col }, { data: filas }] = await Promise.all([
    supabase.from("of_colecciones").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("of_archivos")
      .select("id, coleccion_id, fase, slot, tipo_archivo, orden, nombre_original, mime, size_bytes, duracion_seg, descargado_at, subido_of_at, created_at, storage_key, bucket")
      .eq("coleccion_id", id)
      .order("fase", { ascending: true, nullsFirst: false })
      .order("orden", { ascending: true }),
  ]);
  if (!col) notFound();
  const coleccion = col as ColeccionOF;
  // Al abrirlo deja de contar como "nuevo" en el menu (si el SQL 20261009 aun no esta, simplemente no se guarda)
  await supabase.from("of_colecciones").update({ visto_at: new Date().toISOString() }).eq("id", id).then(() => undefined, () => undefined);

  const [{ data: modelo }, fotos] = await Promise.all([supabase.from("modelos").select("id, nombre").eq("id", coleccion.modelo_id).maybeSingle(), versionesFotos()]);

  const archivos: ArchivoConVista[] = await Promise.all(
    ((filas ?? []) as Array<ArchivoOF & { storage_key: string; bucket: string }>).map(async ({ storage_key, bucket, ...a }) => ({
      ...a,
      vista: a.tipo_archivo === "foto" ? await urlVista(storage_key, bucket).catch(() => null) : null,
    })),
  );

  return (
    <PanelLayout>
      <ColeccionDetalle
        coleccion={coleccion}
        modelo={{ id: coleccion.modelo_id, nombre: modelo?.nombre ?? "—", foto: fotos[coleccion.modelo_id] ?? null }}
        archivos={archivos}
      />
    </PanelLayout>
  );
}
