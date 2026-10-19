import { PanelLayout } from "@/components/PanelLayout";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { alcanceActual, ambitosModelos, soloVisibles, veModelo } from "@/lib/alcance";
import { versionesFotos } from "@/lib/fotosModelos";
import { codigosDeCopias, leerPedidos, pedidosConVistas } from "@/lib/trialReelsManual";
import type { ViralPropio } from "@/app/instagram/ViralesPropiosTab";
import { TrialReelsClient } from "./TrialReelsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trial reels" };

async function cargar() {
  if (!canUseSupabase()) return { virales: [] as ViralPropio[], pedidos: [], copias: [] as string[], guardados: 0 };
  const db = createAdminClient();
  const alcance = await alcanceActual();
  const [virales, cuentas, modelos, fotos] = await Promise.all([
    soloVisibles(db.from("virales_propios").select("*").order("fecha_publicacion", { ascending: false }).limit(2000), alcance),
    soloVisibles(db.from("cuentas_instagram").select("id, username, modelo_id"), alcance),
    soloVisibles(db.from("modelos").select("id, nombre"), alcance, "id"),
    versionesFotos(),
  ]);
  const cuentaPorId = new Map((cuentas.data ?? []).map((c) => [c.id as string, c]));
  const nombrePorId = new Map((modelos.data ?? []).map((m) => [m.id as string, m.nombre as string]));
  const lista: ViralPropio[] = virales.error
    ? []
    : (virales.data ?? []).map((v) => {
        const c = cuentaPorId.get(v.cuenta_id);
        const modeloId = (v.modelo_id ?? c?.modelo_id ?? null) as string | null;
        return {
          ...v,
          vistas: Number(v.vistas),
          likes: Number(v.likes),
          comentarios: Number(v.comentarios),
          compartidos: Number(v.compartidos),
          viral_score: v.viral_score === null ? null : Number(v.viral_score),
          mediana_cuenta: v.mediana_cuenta === null ? null : Number(v.mediana_cuenta),
          modelo_id: modeloId,
          username: (c?.username as string | undefined) ?? "?",
          modelo_nombre: modeloId ? (nombrePorId.get(modeloId) ?? "") : "",
          foto: modeloId ? (fotos[modeloId] ?? null) : null,
        } as ViralPropio;
      });
  const info = new Map(lista.map((v) => [v.id, `${String(v.username).replace(/^@/, "")}_${v.codigo}`]));
  const pedidos = await pedidosConVistas(
    (await leerPedidos()).filter((p) => veModelo(alcance, p.modelo_id)),
    (p, n) => `trial_${info.get(p.viral_id) ?? p.viral_id}_v${n}.mp4`,
  );
  // A Trial reels solo llegan los que TU apruebas en «Virales propios»; los demas (por revisar, descartados) se quedan guardados alli
  // (los que ya tienen versiones generadas se siguen viendo, para no esconder trabajo hecho)
  const conPedido = new Set(pedidos.map((p) => p.viral_id));
  const aprobados = lista.filter((v) => v.estado === "aprobado" || v.estado === "subido" || conPedido.has(v.id));
  return { virales: aprobados, guardados: lista.length - aprobados.length, pedidos, copias: [...(await codigosDeCopias().catch(() => new Set<string>()))] };
}

export default async function TrialReelsPage() {
  const [{ virales, pedidos, copias, guardados }, { esDueno, porModelo }] = await Promise.all([cargar(), ambitosModelos()]);
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Instagram</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Trial reels</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          De cada vídeo viral que apruebes en Instagram → Virales propios sacamos hasta 3 versiones con pequeños retoques (un poco de zoom por la izquierda, la derecha o el centro, brillo, saturación, tono, un filtro suave y sin metadatos) para que no sean exactamente el mismo vídeo. Las descargas y las programas tú. Siempre se generan a partir del vídeo original que guardó el buscador, nunca de una copia.
        </p>
      </div>
      <TrialReelsClient virales={virales} pedidos={pedidos} copias={copias} guardados={guardados} esDueno={esDueno} ambitos={porModelo} />
    </PanelLayout>
  );
}
