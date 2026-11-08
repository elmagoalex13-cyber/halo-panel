import { createHash } from "crypto";
import { PanelLayout } from "@/components/PanelLayout";
import { listarClavesR2 } from "@/lib/r2";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, ambitosModelos, soloVisibles } from "@/lib/alcance";
import { versionesFotos } from "@/lib/fotosModelos";
import { leerEdicionManual } from "@/lib/edicionManual";
import { tipoVideoEfectivo } from "@/lib/tipoVideo";
import { EditarClient, type ModeloEditar } from "./EditarClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar vídeos" };

const baseR2 = () => (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
const hashOriginal = (clave: string) => createHash("sha1").update(clave).digest("hex").slice(0, 20);

async function cargar(): Promise<{ modelos: ModeloEditar[] }> {
  const vacio = { modelos: [] as ModeloEditar[] };
  if (!canUseSupabase()) return vacio;
  try {
    const db = createAdminClient();
    const alcance = await alcanceActual();
    const [modelosRes, esperaRes, edicionRes, manual, fotos] = await Promise.all([
      soloVisibles(db.from("modelos").select("id, nombre, activa, objetivo_videos, captacion_aprobada_at").is("eliminada_at", null).order("nombre"), alcance, "id"),
      soloVisibles(
        db
          .from("library_content")
          .select("id, modelo_id, titulo, filename_original, recibido_at, size_bytes, tipo, tipo_video, r2_key, r2_key_original")
          .eq("origen", "upload_manual")
          .eq("estado", "recibido")
          .or("tipo.is.null,tipo.not.in.(3,5)")
          .order("recibido_at", { ascending: false })
          .limit(1000),
        alcance,
      ),
      soloVisibles(db.from("library_content").select("modelo_id, estado_procesamiento").eq("origen", "upload_manual").eq("estado", "editando").limit(3000), alcance),
      leerEdicionManual().catch(() => ({} as Record<string, boolean>)),
      versionesFotos(),
    ]);

    // Que vistas previas ya existen (las genera el servidor por cada original)
    let previews = new Set<string>();
    try {
      previews = new Set((await listarClavesR2("previews/", 50000)).filter((k) => k.endsWith(".mp4")).map((k) => k.slice("previews/".length, -4)));
    } catch {
      /* sin R2: se enseña sin vista previa */
    }
    const b = baseR2();

    const porModelo = new Map<string, ModeloEditar>();
    for (const m of modelosRes.data ?? []) {
      const id = m.id as string;
      porModelo.set(id, {
        id,
        nombre: String(m.nombre ?? "—"),
        foto: fotos[id] ?? null,
        activa: m.activa !== false,
        enCaptacion: Boolean(m.objetivo_videos) && !m.captacion_aprobada_at,
        manual: manual[id] === true,
        piezas: [],
        enEdicion: { pendiente: 0, procesando: 0, error: 0 },
      });
    }
    for (const f of (esperaRes.data ?? []) as Array<Record<string, unknown>>) {
      const m = porModelo.get(String(f.modelo_id));
      if (!m) continue;
      const clave = String(f.r2_key_original ?? f.r2_key ?? "");
      const h = clave ? hashOriginal(clave) : "";
      m.piezas.push({
        id: String(f.id),
        archivo: (f.filename_original as string | null) ?? (f.titulo as string | null) ?? "vídeo",
        recibido_at: String(f.recibido_at),
        size: (f.size_bytes as number | null) ?? null,
        tipo: tipoVideoEfectivo(f.tipo_video as string | null, f.tipo as number | null),
        preview: h && b && previews.has(h) ? { poster: `${b}/previews/${h}.jpg`, video: `${b}/previews/${h}.mp4` } : null,
      });
    }
    for (const f of (edicionRes.data ?? []) as Array<{ modelo_id: string | null; estado_procesamiento: string | null }>) {
      const m = f.modelo_id ? porModelo.get(f.modelo_id) : null;
      const clave = f.estado_procesamiento === "error" ? "error" : f.estado_procesamiento === "procesando" ? "procesando" : "pendiente";
      if (m) m.enEdicion[clave]++;
    }
    return { modelos: [...porModelo.values()] };
  } catch {
    return vacio;
  }
}

export default async function EditarPage() {
  const [{ modelos }, { esDueno, porModelo }] = await Promise.all([cargar(), ambitosModelos()]);
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Tú decides qué se edita</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Editar vídeos</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Aquí esperan los vídeos que suben las modelos. Elige los que quieras de cada una y mándalos a editar. Cuando estén editados, pasan a Aprobación.
        </p>
      </div>
      <EditarClient modelos={modelos} esDueno={esDueno} ambitos={porModelo} />
    </PanelLayout>
  );
}
