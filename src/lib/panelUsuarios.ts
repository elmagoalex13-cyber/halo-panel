import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, esDueno, leerAdminSesion } from "@/lib/adminAuth";
import { areasValidas, type AreaId } from "@/lib/areas";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

// Usuarios adicionales del panel (tabla panel_usuarios). Contraseñas con scrypt + sal; nunca en claro.

export type UsuarioPanel = {
  id: string;
  username: string;
  nombre: string | null;
  activo: boolean;
  areas_denegadas: AreaId[];
  ultimo_acceso_at: string | null;
  created_at: string;
};

const hashear = (password: string, salt: string) => crypto.scryptSync(password, salt, 64).toString("hex");

export const normalizarUsuario = (u: string) => u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);

export function generarPassword() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(14), (b) => alfabeto[b % alfabeto.length]).join("");
}

export async function verificarUsuarioPanel(username: string, password: string): Promise<{ username: string } | null> {
  if (!canUseSupabase()) return null;
  const u = normalizarUsuario(username);
  if (!u || !password) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("panel_usuarios").select("id, username, salt, hash, activo").eq("username", u).maybeSingle();
    if (!data || !data.activo) return null;
    const candidato = Buffer.from(hashear(password, data.salt), "hex");
    const real = Buffer.from(data.hash, "hex");
    if (candidato.length !== real.length || !crypto.timingSafeEqual(candidato, real)) return null;
    await supabase.from("panel_usuarios").update({ ultimo_acceso_at: new Date().toISOString() }).eq("id", data.id);
    return { username: data.username };
  } catch {
    return null;
  }
}

export async function crearUsuarioPanel(username: string, nombre: string, denegadas: AreaId[]) {
  const u = normalizarUsuario(username);
  if (u.length < 3) throw new Error("El usuario necesita al menos 3 letras o números");
  if (esDueno(u) || (process.env.ADMIN_USERNAME ?? "").toLowerCase() === u) throw new Error("Ese usuario ya está en uso");
  const password = generarPassword();
  const salt = crypto.randomBytes(16).toString("hex");
  const { data, error } = await createAdminClient()
    .from("panel_usuarios")
    .insert({ username: u, nombre: nombre.trim().slice(0, 80) || null, salt, hash: hashear(password, salt), areas_denegadas: denegadas })
    .select("id, username, nombre, activo, areas_denegadas, ultimo_acceso_at, created_at")
    .single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Ese usuario ya existe" : error.message);
  return { usuario: data as UsuarioPanel, password };
}

export async function nuevaPassword(id: string) {
  const password = generarPassword();
  const salt = crypto.randomBytes(16).toString("hex");
  const { error } = await createAdminClient().from("panel_usuarios").update({ salt, hash: hashear(password, salt) }).eq("id", id);
  if (error) throw new Error(error.message);
  return password;
}

export async function listarUsuariosPanel(): Promise<UsuarioPanel[]> {
  const { data } = await createAdminClient()
    .from("panel_usuarios")
    .select("id, username, nombre, activo, areas_denegadas, ultimo_acceso_at, created_at")
    .order("created_at", { ascending: true });
  return ((data ?? []) as UsuarioPanel[]).map((u) => ({ ...u, areas_denegadas: areasValidas(u.areas_denegadas) }));
}

export type SesionPanel = { usuario: string; dueno: boolean; denegadas: AreaId[]; nombre: string | null };

/** Quien esta usando el panel ahora (para rutas de API y paginas del servidor). null = sin sesion valida. */
export const sesionPanelActual = cache(async (): Promise<SesionPanel | null> => {
  const jar = await cookies();
  const s = await leerAdminSesion(jar.get(ADMIN_COOKIE)?.value);
  if (!s) return null;
  if (esDueno(s.u)) return { usuario: s.u, dueno: true, denegadas: [], nombre: null };
  if (!canUseSupabase()) return null;
  const { data } = await createAdminClient().from("panel_usuarios").select("nombre, activo, areas_denegadas").eq("username", s.u).maybeSingle();
  if (!data || !data.activo) return null;
  return { usuario: s.u, dueno: false, denegadas: areasValidas(data.areas_denegadas), nombre: data.nombre ?? null };
});
