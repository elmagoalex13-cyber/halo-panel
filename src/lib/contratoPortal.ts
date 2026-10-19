// Al firmar el contrato se le crea a la modelo su ficha y su portal (si aun no tiene), con usuario y contrasena, y se le enseñan al momento
// en la pantalla de «contrato firmado». La contrasena solo existe en ese instante (en la base de datos solo queda su huella): si la pierde,
// se genera otra desde su ficha. Nunca rompe la firma: si algo falla, el contrato queda firmado igual y el portal se crea a mano.
import { createAdminClient } from "@/lib/supabase/server";
import { generarPassword, guardarCredencial, leerCredencial, slugify } from "@/lib/portalAuth";
import { mismoNombre } from "@/lib/contratos";

export type PortalCreado = { modelo_id: string; slug: string; usuario: string; password: string; modeloNueva: boolean };

export async function crearPortalTrasFirma(contrato: { id: string; nombre: string; porcentajeAgencia?: number }, nombreFirmante: string): Promise<PortalCreado | { modelo_id: string; yaTenia: true; modelo_nombre: string } | null> {
  try {
    const db = createAdminClient();
    const { data: modelos, error: eMod } = await db.from("modelos").select("id, nombre, portal_token").is("eliminada_at", null);
    if (eMod) return null;
    const candidatas = (modelos ?? []).filter((m) => mismoNombre(contrato.nombre, m.nombre as string));
    if (candidatas.length > 1) return null; // dos modelos con ese nombre: no se adivina cual es

    let modeloId: string;
    let modeloNueva = false;
    let slug: string | null = null;
    if (candidatas.length === 1) {
      modeloId = candidatas[0].id as string;
      // Si el contrato lleva un reparto distinto del de siempre (60-40), la ficha de la modelo (y con ella la facturacion) pasa a llevarlo tambien
      if (contrato.porcentajeAgencia && contrato.porcentajeAgencia !== 70) await db.from("modelos").update({ porcentaje_comision: contrato.porcentajeAgencia }).eq("id", modeloId);
      slug = (candidatas[0].portal_token as string | null) ?? null;
      if (slug && (await leerCredencial(modeloId))) {
        await db.from("contratos_modelos").update({ modelo_id: modeloId }).eq("id", contrato.id);
        return { modelo_id: modeloId, yaTenia: true, modelo_nombre: candidatas[0].nombre as string }; // ya tiene portal: no se le cambia la contrasena
      }
    } else {
      // Modelo nueva (compartida, en fase de captacion, como las que se crean a mano)
      const base = {
        nombre: contrato.nombre.trim(),
        nombre_real: nombreFirmante || null,
        porcentaje_comision: contrato.porcentajeAgencia ?? 70,
        activa: true,
        fecha_alta: new Date().toISOString().split("T")[0],
        ambito: "compartido",
      };
      const objetivos = { objetivo_videos: 30, objetivo_scripts: 4, objetivo_packs: 5, objetivo_posts: 30 };
      let r = await db.from("modelos").insert({ ...base, ...objetivos }).select("id").single();
      if (r.error) r = await db.from("modelos").insert(base).select("id").single(); // faltan columnas de objetivos o de ambito
      if (r.error) r = await db.from("modelos").insert({ nombre: base.nombre, nombre_real: base.nombre_real, porcentaje_comision: contrato.porcentajeAgencia ?? 70, activa: true }).select("id").single();
      if (r.error || !r.data) return null;
      modeloId = r.data.id as string;
      modeloNueva = true;
    }

    if (!slug) {
      const base = slugify(contrato.nombre) || "modelo";
      slug = base;
      for (let i = 2; i < 50; i++) {
        const { data: existe } = await db.from("modelos").select("id").eq("portal_token", slug).maybeSingle();
        if (!existe) break;
        slug = `${base}-${i}`;
      }
      const { error } = await db.from("modelos").update({ portal_token: slug }).eq("id", modeloId);
      if (error) return null;
    }

    const usuario = slug.toLowerCase();
    const password = generarPassword();
    await guardarCredencial(modeloId, usuario, password);
    await db.from("contratos_modelos").update({ modelo_id: modeloId }).eq("id", contrato.id); // si falta el SQL de modelo_id, no pasa nada
    return { modelo_id: modeloId, slug, usuario, password, modeloNueva };
  } catch (e) {
    console.error("[contratos] portal tras la firma:", e instanceof Error ? e.message : e);
    return null;
  }
}
